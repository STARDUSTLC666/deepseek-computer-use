import { randomUUID } from 'node:crypto';
import { appKey } from './access.js';
import { assertTurnOpen, PolicyError, isRedacted, service, turnTokenOf } from './safety.js';
import { GATES } from './tools.js';
import { probeRegistries } from './updater.js';

export const WORKBENCH_ROUTE = '/api/deepseek-computer-use/workbench';

export function createWorkbench(ctx, config, { access, execute, runProgram, stop, restore, helper, draining }) {
  const audit = [];
  const observations = new Map();
  let runtime;
  let runtimeCheck;
  let revision = 0;

  function findObservation(exec, windowId) {
    return [...observations.values()].find(record => record.agent?.session === exec.agent?.session && record.window.id === windowId);
  }

  function record({ name, exec, value, error, started }) {
    const event = {
      id: ++revision, name, at: new Date().toISOString(), elapsedMs: Date.now() - started,
      gates: GATES.map(gate => ({ gate, state: exec.audit[gate] ?? 'skipped' })),
      code: error ? (error.code ?? 'operation_failed') : null,
      timing: value?.screenshots?.[0]?.diagnostic ?? null,
    };
    audit.unshift(event);
    if (audit.length > 100) audit.pop();
    if (error && exec.authorizedWindow) {
      const previous = findObservation(exec, exec.authorizedWindow.id);
      if (previous) previous.active = false;
    }
    if (name === 'get_window_state' && value?.window && !error) {
      const window = value.window;
      const existing = findObservation(exec, window.id);
      const previous = existing?.turn === turnTokenOf(exec)
        && JSON.stringify(existing?.window.bounds) === JSON.stringify(window.bounds) ? existing : null;
      const windowKey = existing?.windowKey ?? randomUUID();
      observations.delete(windowKey);
      observations.set(windowKey, {
        windowKey,
        id: randomUUID(), at: Date.now(), agent: exec.agent, turn: turnTokenOf(exec), generation: exec.appGeneration,
        window, active: true, redacted: value.redacted === true,
        accessibility: value.accessibility ?? previous?.accessibility ?? null,
        shots: value.redacted ? [] : value.screenshots?.length ? value.screenshots : previous?.shots ?? [],
        notices: value.notices ?? [],
        point: previous?.point ?? null, clientBounds: value.clientBounds, dpiScale: value.dpiScale,
      });
      if (observations.size > 12) observations.delete(observations.keys().next().value);
    }
    if (exec.authorizedWindow && value?.dispatched !== false && (Number.isFinite(value?.screenX) || Array.isArray(value?.to))) {
      const previous = findObservation(exec, exec.authorizedWindow.id);
      if (previous) previous.point = value.to ?? [value.screenX, value.screenY];
    }
  }

  function clearApp(id) {
    for (const [key, record] of observations) {
      if (appKey(record.window.app?.id) === appKey(id)) observations.delete(key);
    }
    revision++;
  }

  function forget(session) {
    for (const record of observations.values()) if (record.agent?.session === session) record.active = false;
  }

  async function checkRuntime() {
    if (!runtimeCheck) {
      runtimeCheck = access.systemStatus().then(state => {
        const { buildHash, providerRegistered } = helper();
        runtime = { ...state, buildHash, providerRegistered, audioEnabled: config.audio };
        return runtime;
      }).finally(() => { runtimeCheck = undefined; });
    }
    return runtimeCheck;
  }

  function snapshot(record) {
    if (!record) return null;
    const { id, windowKey, at, active, window, clientBounds, dpiScale, accessibility, point, notices, shots, generation, agent, turn } = record;
    const redacted = record.redacted || isRedacted(config, window.app) || access.isRedacted(window.app);
    let live = active && Date.now() - at <= config.snapshotTtlMs && generation === access.generation(window.app?.id);
    if (live && agent) {
      try { assertTurnOpen({ agent }); } catch { live = false; }
    }
    const view = { id, windowKey, at, title: window.title, app: window.app?.displayName, appId: window.app?.id, bounds: window.bounds, clientBounds, dpiScale,
      redacted, active: live && Boolean(agent) && turnTokenOf({ agent }) === turn, accessibility, point, notices,
      screenshots: redacted ? [] : shots.filter(shot => shot.attachment).map(({ id, width, height, originX, originY, scaleX, scaleY }) =>
        ({ id, width, height, originX, originY, scaleX, scaleY })) };
    if (generation !== access.generation(window.app?.id)) return null;
    return view;
  }

  function selectView(input) {
    const record = [...observations.values()].find(record => record.id === input.snapshotId);
    const view = snapshot(record);
    if (!view) throw new PolicyError('SNAPSHOT_REPLACED', 'The observation changed. Refresh the workbench.');
    return { view, record };
  }

  async function handle(input, signal) {
    if (draining()) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use provider is shutting down');
    switch (input.action) {
      case 'state': {
        const applications = await access.applications();
        const records = [...observations.values()].reverse().filter(record => record.generation === access.generation(record.window.app?.id));
        const selected = records.find(record => record.windowKey === input.windowKey) ?? records[0];
        return { applications, runtime, dryRun: config.dryRun, revision, snapshot: snapshot(selected), audit: [...audit],
          windows: records.map(({ windowKey, window }) => ({ windowKey, title: window.title, appId: window.app?.id })),
          ptc: access.ptcConfiguration() };
      }
      case 'system': return checkRuntime();
      case 'health': {
        const status = await checkRuntime();
        return { ...status, granted: (await access.applications()).savedGrants.length };
      }
      case 'icons': return access.applicationIcons();
      case 'registries': return probeRegistries(signal);
      case 'revoke': await access.revoke(input.id); clearApp(input.id); return true;
      case 'revokeSessions': {
        const state = await access.applications();
        await Promise.all(state.sessionGrants.map(row => access.revoke(row.id)));
        return true;
      }
      case 'retry': await access.retryApproval(input.id); return true;
      case 'redact': await access.addRedaction(input.id); return true;
      case 'dryRun':
        if (typeof input.enabled !== 'boolean') throw new PolicyError('invalid_arguments', 'Select the dry-run state');
        config.dryRun = input.enabled;
        return config.dryRun;
      case 'stop':
        await stop();
        await restore();
        for (const record of observations.values()) record.active = false;
        runtime = null;
        return true;
      case 'restore': await restore(); runtime = null; return true;
      case 'image': {
        await access.refresh();
        const { view, record } = selectView(input);
        const image = view.screenshots.find(shot => shot.id === input.id);
        const ref = image && record.shots.find(shot => shot.id === image.id)?.attachment;
        if (!ref) throw new PolicyError('SCREENSHOT_UNAVAILABLE', 'No screenshot is available for this observation');
        const stored = await service(ctx, 'attachments')?.readImage(ref, signal);
        if (!stored) throw new PolicyError('SCREENSHOT_UNAVAILABLE', 'The screenshot store is unavailable');
        await access.refresh();
        if (!selectView(input).view.screenshots.some(shot => shot.id === image.id)) {
          throw new PolicyError('SCREENSHOT_UNAVAILABLE', 'Screenshot access changed');
        }
        return new Response(Buffer.from(stored.data), { headers: { 'content-type': stored.ref?.mediaType ?? ref.mediaType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }
      case 'invoke':
      case 'observe':
      case 'program':
      case 'setValue': {
        await access.refresh();
        const { view, record } = selectView(input);
        const selected = view.accessibility?.elements?.find(element => element.index === input.element);
        if (!view.active || (['invoke', 'setValue'].includes(input.action) && !selected)) {
          throw new PolicyError('fresh_observation_required', 'Observe the window in the active session before testing this control');
        }
        const window = { id: record.window.id };
        const exec = { agent: record.agent, signal, operator: true, appId: record.window.app?.id, appGeneration: record.generation,
          assertObservation() {
            if (observations.get(record.windowKey) !== record || !snapshot(record)?.active) {
              throw new PolicyError('SNAPSHOT_REPLACED', 'Observe the current window before acting');
            }
          },
        };
        if (input.action === 'observe') {
          await execute('get_window_state', { window, include_text: true, include_screenshot: !view.redacted,
            include_menus: input.includeMenus === true, details: input.details === true,
            ...(input.region === undefined ? {} : { region: input.region }) }, exec);
          return true;
        }
        if (input.action === 'program') {
          return runProgram({ code: input.code }, { agent: record.agent, signal });
        }
        if (input.action === 'invoke') {
          if (!selected.actions?.includes('Invoke')) throw new PolicyError('invalid_arguments', 'This element does not advertise the Invoke pattern');
          return execute('perform_secondary_action', { window, element_index: selected.index, action: 'Invoke' }, exec);
        }
        if (!selected.valueWritable || typeof input.value !== 'string') throw new PolicyError('invalid_arguments', 'This element requires a writable value');
        return execute('set_value', { window, element_index: selected.index, value: input.value }, exec);
      }
      default: throw new PolicyError('invalid_arguments', 'Unknown Computer Use workbench operation');
    }
  }

  async function fetch(request) {
    const response = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST' || request.headers.get('x-deepseek-computer-use') !== '1'
      || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
      return response({ ok: false, code: 'invalid_request' }, 400);
    }
    try {
      const body = await request.text();
      if (body.length > 16384) throw new PolicyError('invalid_arguments', 'Computer Use workbench request exceeds the size limit');
      const input = JSON.parse(body);
      if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new PolicyError('invalid_arguments', 'Expected a request object');
      const result = await handle(input, request.signal);
      return result instanceof Response ? result : response({ ok: true, value: result });
    } catch (error) {
      return response({ ok: false, code: error.code ?? 'operation_failed', error: String(error.message).slice(0, 600) }, 400);
    }
  }

  return { record, clearApp, forget, fetch, checkRuntime };
}
