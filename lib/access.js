import { createHash, randomUUID } from 'node:crypto';
import fs, { constants } from 'node:fs/promises';
import path from 'node:path';
import { acquireLock } from './build-helper.mjs';
import { PolicyError, requestApproval, service } from './safety.js';

export const appKey = id => typeof id === 'string' ? id.trim().replaceAll('/', '\\').toLowerCase() : '';
const localExe = /^[a-z]:\\[^\0]+\.exe$/i;
const revoked = () => new PolicyError('APP_ACCESS_REVOKED', 'Application access was revoked');
const consentDenied = () => new PolicyError('approval_denied', 'Application access was refused. Allow asking again in the Computer Use workbench.');

function appRecord(app) {
  const id = app.aumid || app.executablePath || app.id;
  if (!appKey(id)) throw new PolicyError('app_identity_unavailable', 'The window owner could not be identified');
  const displayName = app.displayName || app.name || id;
  return { id, displayName, name: displayName, aumid: app.aumid ?? null, executablePath: app.executablePath ?? null };
}

async function ask(ctx, exec, app, persistent, toolName) {
  const questions = service(ctx, 'userQuestions');
  const approval = service(ctx, 'approval');
  const reason = 'Allow Computer Use to access ' + app.displayName + ' (' + app.id + ')?';
  if (exec?.agent && typeof questions?.ask === 'function' && approval?.effectivePolicy?.(exec.agent.session) !== 'never') {
    const reject = 'Refuse';
    const approve = 'Allow for this session';
    const always = 'Always allow';
    try {
      const answer = await questions.ask({
        agent: exec.agent, signal: exec.signal,
        questions: [{
          id: 'computer-use-app', question: reason, detail: app.executablePath ?? app.id,
          options: (persistent ? [reject, approve, always] : [reject, approve]).map(label => ({ label })),
          intent: { kind: 'approval', reject, approve, ...(persistent ? { always } : {}), subject: { name: app.displayName } },
        }],
      });
      exec.signal?.throwIfAborted();
      const choice = answer?.answers?.find(item => item.id === 'computer-use-app')?.selected?.[0];
      if (choice === approve) return 'session';
      if (persistent && choice === always) return 'always';
      if (choice === reject) return 'refused';
      throw new PolicyError('approval_denied', 'No application grant was selected');
    } catch (error) {
      if (error.code !== 'NO_PROVIDER') throw error;
    }
  }
  await requestApproval(ctx, exec, { toolName, reason });
  return 'session';
}

function profileFiles(ctx) {
  const dir = service(ctx, 'profileContext')?.dir;
  const primary = typeof dir === 'string' && dir ? path.join(dir, 'data', 'deepseek-computer-use', 'grants.json') : null;
  const identity = primary ?? (process.env.DSH_HOME && path.resolve(process.env.DSH_HOME, 'profiles', process.env.DSH_PROFILE ?? 'default'));
  if (!identity || !process.env.LOCALAPPDATA) return primary ? [primary] : [];
  const key = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  const fallback = path.join(process.env.LOCALAPPDATA, 'dsh-computer-use', 'grants-' + key + '.json');
  return primary ? [primary, fallback] : [fallback];
}

function emptyStore() { return { entries: [], redacted: [] }; }

async function readStore(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.redacted)
      || data.entries.some(row => !appKey(row?.id) || !Number.isSafeInteger(row.generation) || row.generation < 0
        || !['always', 'refused', null].includes(row.decision))
      || data.redacted.some(id => !appKey(id))) throw new Error('Invalid application grants file');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    throw error;
  }
}

export function createAccess(ctx, config, { control, revokeNative = async () => {}, onRedact = () => {},
  ptcRuntime = () => service(ctx, 'ptcRuntime') } = {}) {
  const candidates = profileFiles(ctx);
  let file;
  let location;
  let writable = false;
  const records = new Map();
  const sessions = new Map();
  const pending = new Map();
  const active = new Map();
  const revoking = new Map();
  const memoryRedactions = new Set();
  const unscoped = Symbol('unscoped access');
  let available = false;
  let closed = false;
  let redacted = [];
  let refreshTail = Promise.resolve();

  function prepareLocation() {
    location ??= (async () => {
      for (const candidate of candidates) {
        try {
          await fs.mkdir(path.dirname(candidate), { recursive: true });
          await fs.access(path.dirname(candidate), constants.W_OK);
          file = candidate;
          writable = true;
          return;
        } catch {
          // Retain read-only records when they exist, including explicit refusals.
          if (await fs.stat(candidate).then(stat => stat.isFile(), () => false)) {
            file = candidate;
            return;
          }
        }
      }
    })();
    return location;
  }

  const scope = exec => exec?.agent?.session ?? unscoped;
  const generation = id => records.get(appKey(id))?.generation ?? 0;
  const assertGeneration = (id, expected) => {
    if (closed || revoking.has(appKey(id)) || generation(id) !== expected) throw revoked();
  };

  function merge(data) {
    for (const row of data.entries) {
      const key = appKey(row.id);
      const seen = records.get(key);
      if (revoking.has(key) || (seen && seen.generation > row.generation)) continue;
      if (seen && seen.generation !== row.generation) {
        for (const apps of sessions.values()) apps.delete(key);
        for (const binding of active.get(key) ?? []) binding.abort(revoked());
      }
      records.set(key, row);
    }
    redacted = data.redacted;
  }

  function refresh() {
    if (candidates.length === 0) return Promise.resolve();
    const run = async () => {
      await prepareLocation();
      if (!file) return;
      try { merge(await readStore(file)); available = writable; }
      catch {
        available = false;
        for (const [key, row] of records) {
          if (row.decision === 'always') records.set(key, { ...row, decision: null });
        }
      }
    };
    refreshTail = refreshTail.then(run, run);
    return refreshTail;
  }

  async function save(revise, signal) {
    signal?.throwIfAborted();
    await prepareLocation();
    signal?.throwIfAborted();
    if (!file) return;
    if (!writable) throw new PolicyError('PERSISTENCE_UNAVAILABLE', 'The application grants file is read-only');
    const release = await acquireLock(path.dirname(file), path.basename(file) + '.lock');
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      signal?.throwIfAborted();
      const old = await readStore(file);
      signal?.throwIfAborted();
      const data = revise(old);
      await fs.writeFile(temporary, JSON.stringify({ ...data, version: 1 }), { flag: 'wx', mode: 0o600, signal });
      signal?.throwIfAborted();
      await fs.rename(temporary, file);
      merge(data);
      available = true;
    } finally {
      try { await fs.unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      finally { await release(); }
    }
  }

  const changeRecord = (data, key, update) => {
    const previous = data.entries.find(row => appKey(row.id) === key);
    const row = update(previous);
    return { ...data, entries: [...data.entries.filter(item => appKey(item.id) !== key), row] };
  };

  async function ensure(app, exec, { confirmNative, toolName = 'get_window_state' } = {}) {
    const identity = appRecord(app);
    const key = appKey(identity.id);
    const session = scope(exec);
    const controller = new AbortController();
    const signal = exec?.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal;
    const request = { key, session, controller };
    // Consent remains owned until native confirmation and grant caching finish,
    // including refreshes before/after the user-facing question.
    pending.set(request, true);
    try {
    await refresh();
    const initial = generation(key);
    assertGeneration(key, initial);
    signal.throwIfAborted();
    if (exec?.appGeneration !== undefined) assertGeneration(key, exec.appGeneration);
    const decision = records.get(key)?.decision;
    if (decision === 'refused') throw consentDenied();
    if (config.appConsent === 'never') return { ...identity, generation: initial };
    const granted = sessions.get(session) ?? new Map();
    let result = decision === 'always' ? 'always' : granted.has(key) ? 'session' : null;
    let asked = false;
    if (!result) {
      result = await ask(ctx, { ...exec, signal }, identity, available, toolName);
      signal.throwIfAborted();
      asked = true;
    }
    await refresh();
    assertGeneration(key, initial);
    signal.throwIfAborted();
    if (result !== 'refused' && records.get(key)?.decision === 'refused') throw consentDenied();
    if (asked && result === 'refused') {
      const row = { ...identity, decision: result, generation: initial, refusedAt: new Date().toISOString(),
        sessionId: exec?.agent?.session?.id ?? null };
      records.set(key, row);
      await save(data => changeRecord(data, key, old => old && old.generation > initial ? old : row), signal);
      throw consentDenied();
    }
    if (confirmNative) await confirmNative(identity.id);
    assertGeneration(key, initial);
    signal.throwIfAborted();
    if (asked && result === 'always') {
      const row = { ...identity, decision: result, generation: initial, updatedAt: new Date().toISOString() };
      await save(data => changeRecord(data, key, old => {
        signal.throwIfAborted();
        if (old && old.generation !== initial) throw revoked();
        assertGeneration(key, initial);
        return row;
      }), signal);
    }
    signal.throwIfAborted();
    granted.set(key, { ...identity, decision: 'session', generation: initial });
    sessions.set(session, granted);
    return { ...identity, generation: initial };
    } finally { pending.delete(request); }
  }

  function bind(app, exec) {
    const { id } = appRecord(app);
    const key = appKey(id);
    const current = generation(key);
    assertGeneration(id, exec?.appGeneration ?? current);
    const controller = new AbortController();
    const set = active.get(key) ?? new Set();
    set.add(controller);
    active.set(key, set);
    return {
      signal: exec?.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal,
      generation: exec?.appGeneration ?? current,
      release() { set.delete(controller); if (set.size === 0) active.delete(key); },
    };
  }

  async function applications() {
    await refresh();
    const savedGrants = [...records.values()].filter(row => row.decision === 'always');
    const refusedApplications = [...records.values()].filter(row => row.decision === 'refused');
    const sessionGrants = [...new Map([...sessions.values()].flatMap(map => [...map])).values()]
      .filter(row => !savedGrants.some(grant => appKey(grant.id) === appKey(row.id)));
    return { persistenceAvailable: available, persistentAvailable: available,
      savedGrants, allowedApps: savedGrants, refusedApplications, blockedApps: refusedApplications,
      sessionGrants, redactedApplications: [...new Set([...config.redactApps, ...redacted, ...memoryRedactions])] };
  }

  let iconsPending;
  function applicationIcons() {
    if (iconsPending) return iconsPending;
    const load = async () => {
      const state = await applications();
      const paths = [...new Set([...state.savedGrants, ...state.refusedApplications, ...state.sessionGrants]
        .map(row => row.executablePath).filter(exe => typeof exe === 'string' && localExe.test(exe)))];
      const icons = Object.create(null);
      const folder = file && path.join(path.dirname(file), 'icons');
      if (folder && paths.length) await fs.mkdir(folder, { recursive: true }).catch(() => {});
      const misses = [];
      const files = new Map();
      const valid = value => typeof value === 'string' && value.length < 50000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value);
      for (const exe of paths) {
        const stat = await fs.stat(exe).catch(() => null);
        if (!stat?.isFile()) continue;
        if (folder) files.set(exe, path.join(folder, createHash('sha256').update(exe + '\0' + stat.mtimeMs + '\0' + stat.size).digest('hex') + '.txt'));
        const cached = files.has(exe) ? await fs.readFile(files.get(exe), 'utf8').catch(() => null) : null;
        if (valid(cached)) icons[exe] = cached;
        else misses.push(exe);
      }
      for (let i = 0; i < misses.length; i += 32) {
        const batch = misses.slice(i, i + 32);
        const result = await control('get_app_icons', { paths: batch });
        for (const exe of batch) {
          if (!valid(result?.[exe])) continue;
          icons[exe] = result[exe];
          if (files.has(exe)) await fs.writeFile(files.get(exe), icons[exe], { flag: 'wx' }).catch(() => {});
        }
      }
      return icons;
    };
    iconsPending = load().finally(() => { iconsPending = undefined; });
    return iconsPending;
  }

  function revoke(id) {
    const key = appKey(id);
    if (!key) throw new PolicyError('invalid_arguments', 'Select an application to revoke');
    if (revoking.has(key)) return revoking.get(key);
    const now = { ...(records.get(key) ?? appRecord({ id })), decision: null, generation: generation(key) + 1 };
    records.set(key, now);
    for (const apps of sessions.values()) apps.delete(key);
    for (const request of pending.keys()) if (request.key === key) request.controller.abort(revoked());
    for (const controller of active.get(key) ?? []) controller.abort(revoked());
    const close = (async () => {
      const results = await Promise.allSettled([
        save(data => changeRecord(data, key, old => {
          now.generation = Math.max(now.generation, (old?.generation ?? -1) + 1);
          return now;
        })),
        revokeNative(now.id),
      ]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    })().finally(() => revoking.delete(key));
    revoking.set(key, close);
    return close;
  }

  async function retryApproval(id) {
    const key = appKey(id);
    await refresh();
    if (records.get(key)?.decision !== 'refused') return;
    const next = { ...records.get(key), decision: null };
    records.set(key, next);
    await save(data => changeRecord(data, key, old => old?.decision === 'refused' && old.generation === next.generation ? next : old ?? next));
  }

  async function addRedaction(id) {
    const state = await applications();
    const row = [...state.savedGrants, ...state.sessionGrants, ...state.refusedApplications].find(item => appKey(item.id) === appKey(id));
    if (!row) throw new PolicyError('app_not_found', 'Choose an application in the permissions list');
    memoryRedactions.add(row.id);
    onRedact(row.id);
    for (const controller of active.get(appKey(row.id)) ?? []) controller.abort(new PolicyError('APP_REDACTED', 'Screenshots were disabled for this application'));
    await save(data => ({ ...data, redacted: [...new Set([...data.redacted, row.id])] }));
  }

  function forget(session) {
    const key = session ?? unscoped;
    sessions.delete(key);
    for (const request of pending.keys()) if (request.session === key) request.controller.abort(revoked());
  }

  function dispose() {
    closed = true;
    for (const request of pending.keys()) request.controller.abort(revoked());
    for (const bindings of active.values()) for (const controller of bindings) controller.abort(revoked());
    sessions.clear();
    return Promise.allSettled(revoking.values());
  }

  const systemStatus = () => control('get_system_status', {});
  return {
    ensure, bind, generation, assertGeneration, refresh, forget, dispose,
    isRedacted: app => [...redacted, ...memoryRedactions].some(id => appKey(id) === appKey(app?.id)),
    systemStatus, applications, applicationIcons, revoke, retryApproval, addRedaction,
    ptcConfiguration: () => {
      const runtime = ptcRuntime();
      return { available: config.exposeMode !== 'tools' && runtime?.language === 'typescript', persistent: runtime?.retainsState === true, writable: false };
    },
  };
}
