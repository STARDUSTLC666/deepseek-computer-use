/**
 * deepseek-computer-use - Windows Computer Use for DeepSeek Harness.
 *
 * Registers the Codex window2 tool surface on top of a native Windows driver
 * (UI Automation + SendInput + PrintWindow). The heavy lifting lives in a
 * long-lived C# helper so element indexes stay valid across calls; this module
 * owns the DSH seams: tool registration, image attachment, approval gating and
 * config.
 *
 * @module deepseek-computer-use
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperBridge } from './bridge.js';
import { resolveConfig } from './config.js';
import { BIN_DIR, ensurePrepared, findCompiler } from './build-helper.mjs';
import { buildTools, fixedScreenshotTarget } from './tools.js';
import { assertTurnOpen, PolicyError, service, turnTokenOf } from './safety.js';
import { appKey, createAccess } from './access.js';
import { installCua } from './cua-host.js';
import { createWorkbench, WORKBENCH_ROUTE } from './workbench.js';
import { registerPluginUpdater } from './updater.js';
import { PROTOCOL_VERSION } from './win32-env.js';
import { setTimeout as delay } from 'node:timers/promises';

export const name = 'deepseek-computer-use';
// Cordis treats every inject key as required. Optional seams use ctx.get()
// and late-mounted Connection services are scoped with ctx.inject().
export const inject = ['tools'];

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(here, '..', 'skills', 'computer-use');

function readSkill() {
  try {
    const text = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(text);
    if (match === null) return null;
    let skillName = '';
    let description = '';
    for (const rawLine of match[1].split('\n')) {
      const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(rawLine.trim());
      if (keyMatch === null) continue;
      if (keyMatch[1] === 'name') skillName = keyMatch[2].replace(/^["']|["']$/g, '').trim();
      if (keyMatch[1] === 'description') description = keyMatch[2].replace(/^["']|["']$/g, '').trim();
    }
    const content = text.slice(match[0].length).trimStart();
    if (skillName === '' || description === '' || content.length === 0) return null;
    return { name: skillName, description, content };
  } catch {
    return null;
  }
}

export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  const warn = message => {
    try { ctx.logger?.warn?.(message); } catch { /* logger is optional */ }
  };
  const registry = service(ctx, 'computerUse');
  let releaseSlot;
  try { releaseSlot = registry?.register?.(name); }
  catch (error) {
    warn('[dsh-computer-use] Computer-use slot already occupied by ' + (registry.providerName ?? error.message));
    return;
  }

  const runtimes = new Map();
  const releases = new Map();
  const defaultSession = Symbol('unscoped');
  const controlSession = Symbol('operator');
  const turns = new Map();
  const life = new AbortController();
  let draining = false;
  let buildPromise;
  let prepared;
  let closure;
  let scopeApi;
  let workbench;
  let cua;
  let privatePtc;
  let preparingPtc;
  const disposers = [];
  const remember = dispose => { if (typeof dispose === 'function') disposers.push(dispose); };
  const ptcRuntime = () => privatePtc ?? service(ctx, 'ptcRuntime');

  function preparePtc() {
    const ambient = ptcRuntime();
    const loader = service(ctx, 'loader');
    if (ambient?.retainsState || ambient?.language !== 'typescript' || !ctx.isolate || !loader?.import) return Promise.resolve(ambient);
    preparingPtc ??= (async () => {
      try {
        const { default: Runtime } = await loader.import('@deepseek-ai/dsh-ptc-runtime-node');
        check();
        const isolated = ctx.isolate('ptcRuntime');
        const fiber = isolated.plugin(Runtime, { executionMode: 'persistent-in-memory', scriptPersistence: false });
        remember(() => fiber.dispose());
        await fiber.await();
        check();
        privatePtc = service(isolated, 'ptcRuntime');
        return ptcRuntime();
      } catch (error) {
        if (!draining) warn('[dsh-computer-use] persistent PTC: ' + error.message);
        return ambient;
      }
    })();
    return preparingPtc;
  }

  function check(signal) {
    if (draining) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use provider is shutting down');
    signal?.throwIfAborted();
  }

  async function startBridge(signal) {
    if (!config.helperPath) {
      buildPromise ??= ensurePrepared({ log: warn }).then(result => { prepared = result; return result; })
        .catch(error => { buildPromise = undefined; throw error; });
      await buildPromise;
    }
    check(signal);
    return new HelperBridge({
      exe: config.helperPath ?? prepared.helperPath,
      timeoutMs: config.timeoutMs, log: warn, minProtocol: config.helperPath ? 2 : PROTOCOL_VERSION,
      env: { DSH_CU_COMPONENT_DIR: BIN_DIR },
    });
  }

  function turnState(key, token) {
    let turn = turns.get(key);
    if (!turn || token !== turn.token) {
      turn = { token, controller: new AbortController() };
      turns.set(key, turn);
    }
    return turn;
  }

  function scopeSignal(exec) {
    const turn = turnState(exec?.agent?.session ?? defaultSession, turnTokenOf(exec));
    return AbortSignal.any([turn.controller.signal, life.signal, ...(exec?.signal ? [exec.signal] : [])]);
  }

  function assertNotStopped(key, token) {
    const turn = turns.get(key);
    if (turn && token !== undefined && token === turn.token) turn.controller.signal.throwIfAborted();
  }

  const v3 = new Set(['get_system_status', 'get_app_icons', 'revoke_app', 'show_window', 'mouse_move']);
  async function request(method, params = {}, opts = {}) {
    check(opts.signal);
    const key = opts.session ?? defaultSession;
    await releases.get(key);
    check(opts.signal);
    assertNotStopped(key, opts.turnToken);
    let runtime = runtimes.get(key);
    if (!runtime) {
      runtime = { bridge: null, tail: Promise.resolve(), closing: false, lastToken: null, approved: new Set() };
      runtimes.set(key, runtime);
    }
    const run = async () => {
      const signal = opts.signal ? AbortSignal.any([opts.signal, life.signal]) : life.signal;
      check(signal);
      if (runtime.closing) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use session is closing');
      if (opts.session && typeof opts.session === 'object') assertTurnOpen({ agent: { session: opts.session } });
      assertNotStopped(key, opts.turnToken);
      const active = runtime.bridge ??= await startBridge(signal);
      check(signal);
      if (runtime.closing) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use session is closing');
      assertNotStopped(key, opts.turnToken);
      if (!active.running) {
        runtime.approved.clear();
        try {
          await active.request('configure', { requireAppApproval: config.appConsent !== 'never', maxClickHoldMs: config.maxClickHoldMs },
            { timeoutMs: config.timeoutMs, signal, turnToken: opts.turnToken });
        } catch (error) {
          await active.dispose();
          runtime.bridge = null;
          throw error;
        }
      }
      if (opts.turnToken !== undefined && opts.turnToken !== runtime.lastToken) {
        if (runtime.lastToken !== null) await active.request('end_turn', { endingTurn: runtime.lastToken }, { timeoutMs: 5000, signal });
        runtime.lastToken = opts.turnToken;
      }
      if (active.protocolVersion < PROTOCOL_VERSION && (v3.has(method) || params.relative || params.region || params.holdMs || params.modifiers?.length)) {
        throw new PolicyError('protocol_mismatch', 'This operation requires a version 3 Windows helper');
      }
      const timeoutMs = opts.timeoutMs ?? (method === 'launch_app' ? config.launchTimeoutMs
        : method === 'click' && params.holdMs ? Math.max(config.timeoutMs, params.holdMs * (params.click_count ?? 1) + 3000) : config.timeoutMs);
      try {
        check(signal);
        if (runtime.closing) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use session is closing');
        assertNotStopped(key, opts.turnToken);
        const result = await active.request(method, params, { ...opts, signal, timeoutMs });
        if (method === 'approve_app') runtime.approved.add(appKey(params.app));
        return result;
      } catch (error) {
        if (active.running && !draining && !signal.aborted && !['approve_app', 'invalidate_state'].includes(method)) {
          try { await active.request('invalidate_state', {}, { timeoutMs: 2000 }); } catch { /* bridge handles transport failure */ }
        }
        throw error;
      }
    };
    const operation = runtime.tail.then(run, run);
    runtime.tail = operation.catch(() => {});
    return operation;
  }

  const control = (method, params) => request(method, params, { session: controlSession });
  const describeHelper = () => {
    const exe = config.helperPath ?? prepared?.helperPath;
    return {
      path: exe ?? null, buildHash: prepared?.buildHash ?? null, exists: Boolean(exe && fs.existsSync(exe)),
      providerRegistered: typeof releaseSlot === 'function',
      fresh: Boolean(prepared), compiler: findCompiler(), overlay: Boolean(prepared && fs.existsSync(prepared.overlayPath)),
      platform: process.platform, pids: [...runtimes.values()].map(runtime => runtime.bridge?.pid).filter(Number.isInteger),
    };
  };

  function releaseSession(session) {
    const key = session ?? defaultSession;
    if (releases.has(key)) return releases.get(key);
    const runtime = runtimes.get(key);
    turns.get(key)?.controller.abort(new PolicyError('turn_stopped', 'The Computer Use session ended'));
    turns.delete(key);
    access.forget(session);
    scopeApi?.release(session);
    workbench?.forget(session);
    if (!runtime) return Promise.resolve();
    runtime.closing = true;
    const closing = (async () => {
      await runtime.bridge?.dispose();
      await runtime.tail;
      await runtime.bridge?.dispose();
      if (runtimes.get(key) === runtime) runtimes.delete(key);
    })().finally(() => releases.delete(key));
    releases.set(key, closing);
    return closing;
  }

  function stopSession(session) {
    const key = session ?? defaultSession;
    const token = turnTokenOf({ agent: { session } });
    turnState(key, token).controller.abort(new PolicyError('turn_stopped', 'Computer Use was stopped; start a new turn to continue'));
    workbench?.forget(session);
    return runtimes.get(key)?.bridge?.stopTurn(token);
  }

  async function revokeNative(id) {
    workbench?.clearApp(id);
    const key = appKey(id);
    const targets = [...runtimes.entries()].filter(([, runtime]) => runtime.approved.has(key));
    await Promise.all(targets.map(async ([session, runtime]) => {
      await runtime.tail;
      if (!runtime.bridge?.running) return;
      try { await runtime.bridge.request('revoke_app', { app: id }, { timeoutMs: 2000 }); }
      catch { await releaseSession(session === defaultSession ? undefined : session); }
      finally { runtime.approved.delete(key); }
    }));
  }

  const access = createAccess(ctx, config, { control, revokeNative, ptcRuntime, onRedact: id => workbench?.clearApp(id) });
  const mapped = new Map();
  const tools = new Map();
  const execute = (base, args, exec) => {
    const definition = tools.get(config.toolPrefix + base);
    if (!definition) throw new PolicyError('unknown_tool', 'Unknown Computer Use operation');
    return definition.execute(args, exec);
  };
  const programControl = {
    release: agent => cua?.release(agent),
    screenshotRequestTarget: image => mapped.get(image?.attachmentId) ?? fixedScreenshotTarget(config.screenshotTarget, image),
  };
  const rememberScreenshot = (ref, coordinates) => {
    mapped.set(ref.attachmentId, coordinates);
    if (mapped.size > 256) mapped.delete(mapped.keys().next().value);
  };

  function shutdown() {
    if (closure) return closure;
    draining = true;
    const closingAccess = access.dispose();
    const closingPrograms = cua?.dispose();
    closure = (async () => {
      const ready = Promise.allSettled([closingAccess, closingPrograms, ...[...runtimes.values()].map(runtime => runtime.tail)]);
      await Promise.race([ready, delay(2000, undefined, { ref: false })]);
      life.abort(new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use provider is shutting down'));
      const results = await Promise.allSettled([...runtimes.values()].map(runtime => runtime.bridge?.dispose()));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      runtimes.clear();
      turns.clear();
      for (const dispose of disposers.reverse()) {
        try { await dispose(); } catch (error) { warn('[dsh-computer-use] cleanup: ' + error.message); }
      }
      await releaseSlot?.();
    })();
    return closure;
  }

  try {
    const defs = buildTools(config, { request, ctx, log: warn, access, describeHelper,
      draining: () => draining, scopeSignal, onScopeApi: api => { scopeApi = api; },
      onShowWindow: definition => tools.set(definition.name, definition),
      record: event => workbench?.record(event),
      mapScreenshot: rememberScreenshot,
      screenshotTrace: report => {
        try { ctx.logger?.debug?.('[cua-screenshot] ' + JSON.stringify(report).slice(0, 8192)); } catch { /* optional */ }
      },
    });
    for (const definition of defs) tools.set(definition.name, definition);
    workbench = createWorkbench(ctx, config, {
      access, execute, helper: describeHelper, draining: () => draining, restore: () => control('restore_cursor', {}),
      runProgram: (args, exec) => {
        if (!cua?.runtimeAvailable()) throw new PolicyError('PTC_UNAVAILABLE', 'No TypeScript PTC runtime is mounted');
        return cua.program.execute(args, exec);
      },
      stop: () => Promise.all([...new Set([...turns.keys(), ...runtimes.keys()])].filter(key => key !== controlSession)
        .map(key => stopSession(key === defaultSession ? undefined : key))),
    });
    if (config.exposeMode !== 'cua') for (const definition of defs) remember(ctx.tools.register(definition));
    if (config.exposeMode !== 'tools') {
      cua = installCua(ctx, { config, access, execute, releaseSession, scopeSignal, ptcRuntime, preparePtc, draining: () => draining });
      remember(ctx.tools.register(cua.raw));
      if (cua.runtimeAvailable()) {
        remember(ctx.tools.register(cua.program));
        void preparePtc();
      } else if (ctx.inject) {
        const ptc = ctx.inject(['ptcRuntime'], host => {
          if (!draining && cua.runtimeAvailable()) {
            host.effect(() => host.tools.register(cua.program));
            void preparePtc();
          }
        });
        if (ptc?.dispose) remember(() => ptc.dispose());
      }
      const prompt = service(ctx, 'systemPrompt');
      if (prompt?.section) remember(prompt.section({
        name: 'computer-use:deepseek-computer-use',
        order: prompt.getSectionOrder?.('TOOL_COMPUTER_USE') ?? 0,
        text: () => cua.prompt,
      }));
      if (!service(ctx, 'cuaPrograms') && ctx.provide) remember(ctx.provide('cuaPrograms', programControl));
    }
    if (!service(ctx, 'cuaAccess') && ctx.provide) remember(ctx.provide('cuaAccess', {
      systemStatus: access.systemStatus, applications: access.applications, applicationIcons: access.applicationIcons,
      revoke: access.revoke, retryApproval: access.retryApproval, ptcConfiguration: access.ptcConfiguration,
    }));

    const commands = service(ctx, 'commands');
    if (commands?.register) remember(commands.register({
      name: 'cu', description: 'Computer Use status, stop, restore-cursor, or revoke an application.',
      input: { hint: 'status | stop | restore-cursor | revoke <app>' },
      async handler({ rawInput, agent }) {
        check();
        const [verb = 'status', ...rest] = (rawInput ?? '').trim().split(/\s+/).filter(Boolean);
        const session = agent?.session;
        if (verb === 'status') {
          const status = await workbench.checkRuntime();
          const apps = await access.applications();
          return { kind: 'success', text: JSON.stringify({
            buildHash: status.buildHash, protocolVersion: status.protocolVersion, capture: status.captureAvailable ? 'WGC' : 'PrintWindow / BitBlt',
            granted: apps.savedGrants.length + apps.sessionGrants.length, snapshots: scopeApi.snapshotCount(session),
            cursor: status.cursorSuppressed ? 'virtual' : 'normal', sessionLocked: status.sessionLocked,
          }) };
        }
        if (verb === 'stop') { await stopSession(session); await control('restore_cursor', {}); return { kind: 'success', text: 'Computer Use stopped for this turn.' }; }
        if (verb === 'restore-cursor') { await control('restore_cursor', {}); return { kind: 'success', text: 'System cursor restored.' }; }
        if (verb === 'revoke' && rest.length) {
          const needle = appKey(rest.join(' '));
          const state = await access.applications();
          const records = [...state.savedGrants, ...state.sessionGrants, ...state.refusedApplications];
          const exact = records.find(app => appKey(app.id) === needle);
          const matches = exact ? [exact] : records.filter(app => appKey(app.id).includes(needle) || appKey(app.displayName).includes(needle));
          await Promise.all(matches.map(app => access.revoke(app.id)));
          return { kind: matches.length ? 'success' : 'error', text: matches.length ? 'Revoked ' + matches.length + ' application grant(s).' : 'No matching application.' };
        }
        return { kind: 'error', text: 'Usage: /cu status | stop | restore-cursor | revoke <app>' };
      },
    }));
    const mount = connection => connection.fetch?.register?.({
      path: WORKBENCH_ROUTE, methods: ['POST'], requestBody: 'buffered', fetch: workbench.fetch,
    });
    const connection = service(ctx, 'connection');
    if (connection?.fetch) remember(mount(connection));
    else if (ctx.inject) {
      const routes = ctx.inject(['connection'], host => host.effect(() => mount(host.connection)));
      if (routes?.dispose) remember(() => routes.dispose());
    }
    if (!registry && ctx.inject) {
      // A provider service can be enabled after this plugin has already loaded.
      const watcher = ctx.inject(['computerUse'], host => {
        if (draining || releaseSlot) return;
        try { releaseSlot = host.computerUse.register(name); }
        catch (error) {
          warn('[dsh-computer-use] Computer-use slot already occupied by ' + (host.computerUse.providerName ?? error.message));
          void shutdown().catch(failure => warn(failure.message));
        }
      });
      if (watcher?.dispose) remember(() => watcher.dispose());
    }

    const skills = service(ctx, 'skills');
    const skill = readSkill();
    if (skill && skills?.register) remember(skills.register({ ...skill,
      resourceBase: { kind: 'directory', path: SKILL_DIR }, source: 'runtime',
    }));
    registerPluginUpdater(ctx);

    remember(ctx.on?.('session/event', (session, event) => {
      if (event?.type !== 'turn/end') return;
      return stopSession(session)?.catch(error => warn(error.message));
    }));
    remember(ctx.on?.('session/disposed', session => (cua?.release({ session }) ?? releaseSession(session)).catch(error => warn(error.message))));
    if (typeof ctx.effect === 'function') ctx.effect(() => shutdown, 'deepseek-computer-use shutdown');
    else ctx.on?.('dispose', shutdown);
  } catch (error) {
    // Return the asynchronous rollback to Cordis so a new provider cannot overlap it.
    return shutdown().then(() => { throw error; });
  }
}

export { resolveConfig, buildTools, HelperBridge };
export default { name, inject, apply };
