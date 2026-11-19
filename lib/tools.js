/**
 * The Computer Use tool surface.
 *
 * Names and semantics follow Codex's window2 API (list_apps / list_windows /
 * get_window / launch_app / get_window_state / click / press_key / type_text /
 * scroll / set_value / drag / perform_secondary_action / activate_window) so a
 * model trained on either harness moves between them without relearning, plus
 * computer_use_health for DSH-side diagnostics.
 *
 * @module deepseek-computer-use/tools
 */
import {
  assertAppAllowed,
  assertKeyAllowed,
  assertLaunchAllowed,
  assertNotHardDenied,
  assertTurnOpen,
  isRedacted,
  turnTokenOf,
  labelOfElement,
  needsApproval,
  requestApproval,
  PolicyError,
  service,
} from './safety.js';
import { assertArguments, compileParameters } from './parameters.js';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { appKey, createAccess } from './access.js';

const WINDOW_SCHEMA = {
  type: 'object',
  required: true,
  description: 'Target window object taken from list_windows() / list_apps() / get_window_state(). Pass the same object back; only its numeric id is used for addressing.',
  properties: {
    id: { type: 'number', required: true, description: 'Opaque window id (HWND) from list_windows() or list_apps().' },
    app: {
      description: 'App metadata returned by DSH, or a Codex-style app identifier. Optional for id-only window bindings.',
      oneOf: [
        { type: 'string' },
        { type: 'object', additionalProperties: true, properties: { id: { type: 'string', required: true } } },
      ],
    },
    title: { type: 'string', description: 'Window title from the same window object; informational only.' },
  },
  additionalProperties: true,
};

const ELEMENT_INDEX_SCHEMA = {
  type: 'number',
  description: 'Element index from the latest get_window_state(include_text=true) call for the SAME window. Indexes expire after the snapshot TTL.',
};

const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true };
const RELATIVE = { type: 'boolean', description: 'Use integer coordinates 0..999 in the last observed window client area.' };
const MODIFIERS = { type: 'array', items: { type: 'string', enum: ['ctrl', 'control', 'alt', 'shift', 'win'] } };
const POINTER = { type: 'boolean', description: 'Allow moving the physical system pointer after the configured approval.' };
const REGION = {
  type: 'object', description: 'Crop bounds in physical pixels from the observed window frame origin.',
  properties: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, { type: 'integer', required: true }])),
};
const coordinateKeys = ['x', 'y', 'from_x', 'from_y', 'to_x', 'to_y'];
const imageError = 'Current model route does not support image inputs; set include_screenshot: false and include_text: true';
export const GATES = ['Hard Deny', 'Reachability', 'App Consent', 'Action Approval', 'Redact', 'Foreground Proof', 'Snapshot TTL'];

async function acceptsImages(ctx, exec) {
  if (exec?.operator) return true;
  const agent = exec?.agent;
  const direct = exec?.modelCapabilities ?? agent?.modelCapabilities ?? agent?.session?.capabilities;
  if (typeof direct?.supportsImages === 'boolean') return direct.supportsImages;
  if (Array.isArray(direct?.inputModalities)) return direct.inputModalities.includes('image');
  const routed = agent?.session?.requestHeader?.()?.config;
  const provider = routed?.provider ?? agent?.options?.provider;
  const model = routed?.model ?? agent?.options?.model;
  const llm = service(ctx, 'llm');
  if (provider && model && typeof llm?.resolveModelInfo === 'function') {
    let info;
    try { info = await llm.resolveModelInfo(provider, model, exec?.signal); }
    catch { exec?.signal?.throwIfAborted(); }
    if (Array.isArray(info?.inputModalities)) return info.inputModalities.includes('image');
  }
  return true;
}

function json(value) {
  return { type: 'text', text: JSON.stringify(value, null, 2) };
}

function describeWindow(window) {
  const title = window?.title ? '"' + window.title + '"' : '(untitled)';
  const app = window?.app?.name ?? window?.app?.id ?? 'unknown';
  return app + ' | ' + title + ' | id=' + window?.id;
}

export function buildTools(config, deps) {
  const { request, ctx, log, states = new Map() } = deps;
  const access = deps.access ?? createAccess(ctx, config, { control: request });
  const scopes = new WeakMap();
  const createScope = () => ({ audioApproved: false, lastActionAt: new Map(), states: new Map(), shots: new Map(), primaryShots: new Map(),
    invalidWindows: new Set(), observedWindows: new Map() });
  const unscoped = { ...createScope(), states };
  const scopeOf = exec => {
    const session = exec?.agent?.session;
    if (session === null || typeof session !== 'object') return unscoped;
    if (!scopes.has(session)) scopes.set(session, createScope());
    return scopes.get(session);
  };
  // A physical desktop has one pointer and focus. Serialize whole executions,
  // including authorization, rather than just individual native RPC requests.
  let queue = Promise.resolve();
  const inputTools = new Set(['launch_app', 'click', 'press_key', 'type_text', 'scroll', 'drag',
    'set_value', 'perform_secondary_action', 'activate_window', 'show_window', 'mouse_move', 'start_audio_recording']);
  const observedInputs = new Set(['click', 'press_key', 'type_text', 'scroll', 'drag', 'mouse_move', 'set_value', 'perform_secondary_action']);
  const mark = (exec, name, status = 'passed') => { exec.audit[name] = status; };
  deps.onScopeApi?.({
    release: session => {
      if (typeof session === 'object' && session !== null) scopes.delete(session);
      else {
        Object.assign(unscoped, createScope());
        states.clear();
        unscoped.states = states;
      }
    },
    snapshotCount: session => scopeOf({ agent: { session } }).observedWindows.size,
  });
  const markAction = (window, exec) => { if (window?.id !== undefined) scopeOf(exec).lastActionAt.set(Number(window.id), Date.now()); };
  const toolName = base => config.toolPrefix + base;
  // The request budget is chosen per method in index.js (10s / 15s, Codex parity).
  const callOpts = exec => {
    const turnToken = turnTokenOf(exec);
    const scope = scopeOf(exec);
    if (scope.turnToken !== turnToken) {
      scope.states.clear();
      scope.lastActionAt.clear();
      scope.shots.clear();
      scope.primaryShots.clear();
      scope.observedWindows.clear();
      scope.turnToken = turnToken;
    }
    return { signal: exec?.signal, turnToken, session: exec?.agent?.session };
  };
  const rpc = (method, params, exec) => request(method, stripUndefined({
    ...params,
    expectedAppId: params?.window && exec.authorizedWindow?.app?.id || undefined,
    expectedPid: params?.window && exec.authorizedWindow?.app?.pid || undefined,
  }), callOpts(exec));

  const coordinateParams = (params, window, exec) => {
    const scope = scopeOf(exec);
    const observed = scope.observedWindows.get(Number(window.id));
    if (observed && Date.now() - observed.at > config.snapshotTtlMs) {
      throw new PolicyError('fresh_observation_required', 'The coordinate observation expired; observe the window again');
    }
    if (params.relative) {
      if (!observed) throw new PolicyError('SCREENSHOT_REQUIRED', 'Observe the window before using relative coordinates');
      mark(exec, 'Snapshot TTL');
      return params;
    }
    const id = params.screenshotId ?? scope.primaryShots.get(Number(window.id));
    const shot = scope.shots.get(id);
    if (!shot || shot.windowId !== Number(window.id)) {
      if (params.screenshotId !== undefined) throw new PolicyError('stale_screenshot', 'Use a current screenshot of this window');
      return params;
    }
    mark(exec, 'Snapshot TTL');
    const mapped = { ...params, screenshotId: id };
    for (const [key, scale] of [['x', shot.scaleX], ['y', shot.scaleY],
      ['from_x', shot.scaleX], ['to_x', shot.scaleX], ['from_y', shot.scaleY], ['to_y', shot.scaleY]]) {
      if (typeof mapped[key] === 'number') mapped[key] = Math.floor(mapped[key] * scale);
    }
    return mapped;
  };

  /** Resolve + authorize a window before any action touches it. */
  async function authorizeWindow(args, exec) {
    const raw = args?.window ?? (Number.isFinite(Number(args?.windowId)) ? { id: Number(args.windowId) } : undefined);
    const id = Number(raw?.id);
    if (!Number.isFinite(id)) throw new Error('a window object with a numeric "id" is required; list windows first with list_windows');
    const { window } = await rpc('get_window', { window: { id } }, exec);
    assertNotHardDenied(window);
    mark(exec, 'Hard Deny');
    assertAppAllowed(config, window.app, window);
    mark(exec, 'Reachability');
    if (exec.appId !== undefined && appKey(window.app?.id) !== appKey(exec.appId)) {
      throw new PolicyError('WINDOW_CHANGED', 'The window no longer belongs to the selected application');
    }
    await access.refresh();
    const binding = access.bind(window.app, exec);
    exec.binding = binding;
    exec.signal = binding.signal;
    exec.appGeneration = binding.generation;
    exec.authorizedWindow = window;
    await access.ensure(window.app, exec, {
      confirmNative: app => rpc('approve_app', { app }, exec), toolName: toolName('get_window_state'),
    });
    mark(exec, 'App Consent');
    return window;
  }

  async function gate(action, exec, { window, toolName: tool, label, reason, systemPointer = false }) {
    assertTurnOpen(exec);
    const state = window?.id !== undefined ? scopeOf(exec).states.get(Number(window.id)) : undefined;
    const targetLabel = label ?? labelOfElement(state, action?.element_index);
    const willAsk = (systemPointer && config.requireSystemPointerApproval) || needsApproval(config, { toolName: tool, label: targetLabel });
    if (willAsk) {
      await requestApproval(ctx, exec, {
        toolName: tool,
        reason: reason ?? ('Windows UI action in ' + describeWindow(window) + (targetLabel ? ' on "' + targetLabel.trim() + '"' : '')),
      });
    }
    mark(exec, 'Action Approval');
    if (action?.element_index !== undefined && state?.elements?.some(element => element.index === action.element_index)
      && Date.now() - state.at <= config.snapshotTtlMs) mark(exec, 'Snapshot TTL');
  }

  const failureGate = {
    hard_denied: 'Hard Deny', app_denied: 'Reachability', app_not_allowed: 'Reachability',
    APP_ACCESS_REVOKED: 'App Consent', app_identity_unavailable: 'App Consent', approval_unavailable: 'Action Approval',
    APP_REDACTED: 'Redact', focus_failed: 'Foreground Proof', pointer_intercepted_by_foreign_window: 'Foreground Proof',
    drag_intercepted_by_foreign_window: 'Foreground Proof', screen_locked: 'Foreground Proof',
    WINDOW_CHANGED: 'Snapshot TTL', SCREENSHOT_REQUIRED: 'Snapshot TTL',
    fresh_observation_required: 'Snapshot TTL', stale_screenshot: 'Snapshot TTL', stale_element: 'Snapshot TTL',
  };
  function action(name, description, parameters, run) {
    const schema = compileParameters(parameters);
    return {
      name: toolName(name),
      description,
      parameters: schema,
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [json(value)] },
      isConcurrencySafe: () => false,
      execute: (args, exec) => {
        if (deps.draining?.()) return Promise.reject(new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use provider is shutting down'));
        const signal = deps.scopeSignal?.(exec) ?? exec?.signal;
        const execute = async () => {
          if (deps.draining?.()) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use provider is shutting down');
          assertArguments(schema, args);
          if (inputTools.has(name)) assertTurnOpen(exec);
          signal?.throwIfAborted();
          exec?.assertObservation?.();
          const execution = { ...exec, signal, audit: Object.create(null) };
          callOpts(execution);
          const scope = scopeOf(exec);
          const windowId = Number(args?.window?.id);
          const started = Date.now();
          try {
            if (observedInputs.has(name) && scope.invalidWindows.has(windowId)) {
              throw new PolicyError('fresh_observation_required', 'The previous action failed; call get_window_state again and inspect the new observation before retrying');
            }
            if (args.relative === true) {
              if (args.screenshotId !== undefined || args.element_index !== undefined) {
                throw new PolicyError('invalid_arguments', 'Relative coordinates use a window observation and cannot identify a screenshot or element');
              }
              const keys = name === 'drag' ? coordinateKeys.slice(2) : coordinateKeys.slice(0, 2);
              if (!keys.every(key => Number.isInteger(args[key]) && args[key] >= 0 && args[key] <= 999)) {
                throw new PolicyError('invalid_arguments', 'Relative coordinates must be integers from 0 to 999');
              }
            }
            const value = await run(args, execution);
            execution.signal?.throwIfAborted();
            if (name === 'get_window_state') {
              scope.invalidWindows.delete(windowId);
              if (value.accessibility || value.screenshots?.length) scope.observedWindows.set(windowId, { at: Date.now() });
            }
            if (value?.clicked === 'pointer' || value?.scrolled || value?.dragged || value?.systemPointerMoved
              || value?.pressed || value?.typed || value?.activated) mark(execution, 'Foreground Proof');
            deps.record?.({ name, exec: execution, value, started });
            return value;
          } catch (error) {
            if ((inputTools.has(name) || name === 'get_window_state')
              && !['invalid_arguments', 'MODEL_DOES_NOT_SUPPORT_IMAGES'].includes(error.code)) {
              for (const id of scope.observedWindows.keys()) scope.invalidWindows.add(id);
              scope.states.clear();
              scope.shots.clear();
              scope.primaryShots.clear();
              if (Number.isFinite(windowId)) scope.invalidWindows.add(windowId);
              if (!['cancelled_by_user', 'turn_stopped', 'turn_ended', 'cancelled', 'AbortError'].includes(error.code ?? error.name)) {
                error.message += ' Re-observe with get_window_state before retrying; the previous input outcome may be unknown.';
              }
            }
            const actual = execution.signal?.reason?.code === 'APP_ACCESS_REVOKED' ? execution.signal.reason : error;
            const gate = failureGate[actual.code] ?? (actual.code === 'approval_denied'
              ? (execution.audit['App Consent'] ? 'Action Approval' : 'App Consent') : undefined);
            if (gate) mark(execution, gate, 'blocked');
            deps.record?.({ name, exec: execution, error: actual, started });
            throw actual;
          } finally { execution.binding?.release(); }
        };
        const result = queue.then(execute, execute);
        queue = result.catch(() => {});
        return result;
      },
    };
  }

  const tools = [];

  tools.push(action(
    'list_windows',
    'List the open, on-screen windows that Computer Use can target: id, title, owning app, z-order and bounds. Start most tasks with list_apps() instead when you do not know the app yet.',
    {},
    async (_args, exec) => rpc('list_windows', {}, exec),
  ));

  tools.push(action(
    'list_apps',
    'List installed apps that currently own a targetable window, each with its open windows. Prefer this over list_windows when the task names an application rather than a window.',
    {},
    async (_args, exec) => rpc('list_apps', {}, exec),
  ));

  tools.push(action(
    'get_window',
    'Re-read one open window by id. Use it after losing a window binding, or to refresh bounds before coordinate work.',
    { window: WINDOW_SCHEMA },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      return { window };
    },
  ));

  tools.push({
    ...action(
      'launch_app',
      'Launch an app so its window becomes targetable. Accepts an app id from list_apps() or an explicit .exe path. Launching needs user approval under the default policy.',
      {
        app: { type: 'string', required: true, description: 'App id from list_apps(), a process name, or an explicit .exe path.' },
        args: { type: 'array', items: { type: 'string' }, description: 'Optional command line arguments, e.g. the document to open.' },
      },
      async (args, exec) => {
        assertLaunchAllowed(args.app);
        mark(exec, 'Hard Deny');
        assertAppAllowed(config, { id: args.app });
        mark(exec, 'Reachability');
        if (config.dryRun) return { dryRun: true, wouldLaunch: args.app };

        if (needsApproval(config, { toolName: 'launch_app' })) {
          await requestApproval(ctx, exec, { toolName: toolName('launch_app'), reason: 'launch application "' + args.app + '"' + (Array.isArray(args.args) && args.args.length > 0 ? ' with arguments ' + args.args.join(' ') : '') });
        }
        mark(exec, 'Action Approval');
        return rpc('launch_app', { app: args.app, args: args.args }, exec);
      },
    ),
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [json(value)] },
  });

  tools.push({
    ...action(
      'get_window_state',
      'Observe one window. include_text returns the accessibility tree (numbered elements with role, name, bounds and available actions); include_screenshot returns the window image (works even when the window is occluded). Element indexes from this call feed click/set_value/perform_secondary_action until the snapshot TTL expires.',
      {
        window: WINDOW_SCHEMA,
        include_screenshot: { type: 'boolean', description: 'Capture the window image (plus related transient UI such as open menus). Defaults to true, matching the Codex window2 API.' },
        include_text: { type: 'boolean', description: 'Return the numbered accessibility tree. Defaults to false; ask for it when you need element indexes.' },
        maxElements: { type: 'number', description: 'Cap on numbered elements, default from plugin config.' },
        include_menus: { type: 'boolean', description: 'Include visible menu children.' },
        details: { type: 'boolean', description: 'Include automation IDs and supported UI Automation patterns.' },
        max_depth: { type: 'integer', description: 'Maximum UIA tree depth, default 25.' },
        region: REGION,
      },
      async (args, exec) => {
        let includeText = args.include_text === true;
        let includeShot = args.include_screenshot ?? config.defaultIncludeScreenshot;
        const notices = [];
        if (includeShot && !await acceptsImages(ctx, exec)) {
          if (args.include_screenshot === true || args.region) throw new PolicyError('MODEL_DOES_NOT_SUPPORT_IMAGES', imageError);
          includeShot = false;
          includeText = true;
          notices.push(imageError);
        }
        const window = await authorizeWindow(args, exec);
        const redacted = isRedacted(config, window.app) || access.isRedacted(window.app);
        mark(exec, 'Redact', redacted ? 'blocked' : 'passed');
        if (redacted) {
          if (includeShot && !includeText && args.include_screenshot === true) {
            throw new PolicyError('APP_REDACTED', 'Screenshots are disabled for this application by the redactApps policy');
          }
          if (includeShot) includeText = true;
          includeShot = false;
        }
        if (!includeText && !includeShot) throw new PolicyError('invalid_arguments', 'Request include_text, include_screenshot, or both');
        // Codex waits for the UI to settle before capturing after an action; the
        // harness-side equivalent is a short settle window here.
        const scope = scopeOf(exec);
        const last = scope.lastActionAt.get(Number(window.id));
        if (last !== undefined) {
          const wait = Math.min(config.settleMs, config.settleMs - (Date.now() - last));
          if (wait > 0) await delay(wait, undefined, { signal: exec?.signal });
        }
        const result = await rpc('get_window_state', {
          window: { id: window.id },
          include_text: includeText,
          include_screenshot: includeShot,
          include_menus: args.include_menus, details: args.details, max_depth: args.max_depth,
          region: includeShot ? args.region : undefined,
          maxElements: Math.min(2000, Math.max(1, Math.trunc(args.maxElements ?? config.maxElements))),
          ttlMs: config.snapshotTtlMs,
        }, exec);
        if (notices.length) result.notices = notices;
        if (result?.accessibility) {
          scope.states.set(Number(window.id), { ...result.accessibility, at: Date.now() });
        }
        if (redacted) {
          // appshot guard: never let these pixels leave the machine
          result.redacted = true;
          result.redactedNote = 'screenshots are disabled for this application by the redactApps policy';
          result.screenshots = [];
        } else if (includeShot && Array.isArray(result?.screenshots)) {
          // Attachment normalization can resize a captured window. The model aims
          // in the stored image, while the helper owns the original capture pixels.
          for (const [id, shot] of scope.shots) {
            if (shot.windowId === Number(window.id)) scope.shots.delete(id);
          }
          const attached = await attachScreenshots(ctx, result.screenshots, window, config.screenshotTarget, exec, deps);
          for (let index = 0; index < attached.length; index++) {
            const source = result.screenshots[index];
            const stored = attached[index];
            if (source.width > 0 && source.height > 0 && stored.width > 0 && stored.height > 0) {
              scope.shots.set(stored.id, { windowId: Number(window.id), scaleX: source.width / stored.width, scaleY: source.height / stored.height });
            }
          }
          scope.primaryShots.delete(Number(window.id));
          if (attached.length) scope.primaryShots.set(Number(window.id), attached[0].id);
          result.screenshots = attached;
        }
        return result;
      },
    ),
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const parts = [];
        const shots = Array.isArray(value?.screenshots) ? value.screenshots : [];
        const header = describeWindow(value?.window) + '\n' + (shots.length > 0 ? shots.length + ' screenshot(s): ' + shots.map(shot => shot.id + ' ' + shot.width + 'x' + shot.height + '@' + shot.originX + ',' + shot.originY).join(', ') : 'no screenshot');
        parts.push({ type: 'text', text: header });
        for (const notice of value?.notices ?? []) parts.push({ type: 'text', text: notice });
        if (value?.redactedNote) parts.push({ type: 'text', text: value.redactedNote });
        if (value?.accessibility?.tree) parts.push({ type: 'text', text: value.accessibility.tree });
        else if (value?.accessibility?.document_text) parts.push({ type: 'text', text: value.accessibility.document_text.slice(0, 4000) });
        if (value?.accessibility?.selected_text) parts.push({ type: 'text', text: 'selected: ' + value.accessibility.selected_text.slice(0, 500) });
        for (const shot of shots) {
          if (shot.attachment !== undefined) parts.push({ type: 'image', attachment: shot.attachment });
        }
        return parts;
      },
    },
  });

  tools.push({
    ...action(
      'click',
      'Click an element from the latest observation (element_index) or a window-relative pixel coordinate (x, y). A plain left click on an element that exposes Invoke is delivered semantically, which survives occlusion; every other click moves the real pointer.',
      {
        window: WINDOW_SCHEMA,
        element_index: ELEMENT_INDEX_SCHEMA,
        x: { type: 'number', description: 'Window-relative X in pixels. Required with y when element_index is absent.' },
        y: { type: 'number', description: 'Window-relative Y in pixels. Required with x when element_index is absent.' },
        click_count: { type: 'number', description: 'Number of clicks, default 1 (2 = double click, 3 = triple click).' },
        mouse_button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Which button to press, default left.' },
        mouseButton: { type: 'string', enum: ['left', 'right', 'middle'] },
        clickCount: { type: 'integer', enum: [1, 2] },
        holdMs: { type: 'integer', description: 'Hold the mouse button for this many milliseconds.' },
        modifiers: MODIFIERS,
        relative: RELATIVE,
        screenshotId: { type: 'string', description: 'Screenshot id from the latest get_window_state; when supplied, x/y are interpreted in that screenshot region (needed for a menu or tooltip screenshot).' },
      },
      async (args, exec) => {
        assertKeyAllowed(args.modifiers?.join('+'));
        if (args.holdMs !== undefined && !(args.holdMs >= 0 && args.holdMs <= config.maxClickHoldMs)) {
          throw new PolicyError('invalid_arguments', 'holdMs exceeds the configured click duration');
        }
        const window = await authorizeWindow(args, exec);
        const params = {
          window: { id: window.id },
          element_index: args.element_index === undefined ? undefined : Number(args.element_index),
          x: args.x === undefined ? undefined : Number(args.x),
          y: args.y === undefined ? undefined : Number(args.y),
          click_count: args.clickCount ?? args.click_count ?? 1,
          mouse_button: args.mouseButton ?? args.mouse_button ?? 'left',
          holdMs: args.holdMs,
          modifiers: args.modifiers,
          relative: args.relative,
        };
        params.screenshotId = args.screenshotId;
        await gate(params, exec, { window, toolName: 'click' });
        const mapped = params.element_index === undefined ? coordinateParams(params, window, exec) : params;
        if (config.dryRun) return { dryRun: true, wouldClick: mapped };
        const clicked = await rpc('click', mapped, exec);
        markAction(window, exec);
        return clicked;
      },
    ),
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [json(value)] },
  });

  tools.push(action(
    'mouse_move',
    'Resolve a hover point or move the system pointer when useSystemPointer is true. Windows UI Automation has no general hover pattern; system-pointer moves can bring the selected window to the foreground.',
    { window: WINDOW_SCHEMA, element_index: ELEMENT_INDEX_SCHEMA, x: { type: 'number' }, y: { type: 'number' },
      relative: RELATIVE, screenshotId: { type: 'string' }, useSystemPointer: POINTER },
    async (args, exec) => {
      if (args.element_index === undefined && (args.x === undefined || args.y === undefined)) {
        throw new PolicyError('invalid_arguments', 'mouse_move requires an element or x and y');
      }
      const window = await authorizeWindow(args, exec);
      const params = { ...args, window: { id: window.id } };
      const mapped = args.element_index === undefined ? coordinateParams(params, window, exec) : params;
      await gate(params, exec, { window, toolName: 'mouse_move', systemPointer: args.useSystemPointer === true,
        reason: 'Move the system pointer in ' + describeWindow(window) });
      if (config.dryRun) return { dryRun: true, wouldMove: mapped, dispatched: false, systemPointerMoved: false };
      const moved = await rpc('mouse_move', mapped, exec);
      if (moved.systemPointerMoved) markAction(window, exec);
      return moved;
    },
  ));

  tools.push(action(
    'press_key',
    'Press one key or a chord in a window, using X keysym style names: a, space, Return, Tab, Control_L+a, Control_L+Shift_L+period, KP_0. Whitespace around + is ignored and Ctrl/Control, Alt, Shift, period/greater and Numpad_0 aliases are accepted.',
    {
      window: WINDOW_SCHEMA,
      key: { type: 'string', required: true, description: 'Key name or + separated chord, e.g. Control_L+s or Return.' },
    },
    async (args, exec) => {
      assertKeyAllowed(args.key);
      const window = await authorizeWindow(args, exec);
      await gate({}, exec, { window, toolName: 'press_key', label: 'key ' + args.key, reason: undefined });
      if (config.dryRun) return { dryRun: true, wouldPress: args.key };
      const pressed = await rpc('press_key', { window: { id: window.id }, key: args.key }, exec);
      markAction(window, exec);
      return pressed;
    },
  ));

  tools.push(action(
    'type_text',
    'Type text into the focused control of a window. Unicode is injected as keystrokes, so this is layout independent (CJK included). The target window is brought to the foreground first, and the action is refused if that cannot be proven.',
    {
      window: WINDOW_SCHEMA,
      text: { type: 'string', required: true, description: 'Text to type. Newlines and tabs become Return and Tab.' },
    },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      await gate({}, exec, { window, toolName: 'type_text', label: 'text ' + String(args.text).slice(0, 40) });
      if (config.dryRun) return { dryRun: true, wouldType: args.text };
      const typed = await rpc('type_text', { window: { id: window.id }, text: args.text }, exec);
      markAction(window, exec);
      return typed;
    },
  ));

  tools.push(action(
    'scroll',
    'Scroll inside a window at a coordinate or element. Negative scrollY scrolls up, positive down; scrollX is horizontal.',
    {
      window: WINDOW_SCHEMA,
      x: { type: 'number', required: true, description: 'X of the point to scroll from, in window/screenshot coordinates. Click a pane first if it needs focus.' },
      y: { type: 'number', required: true, description: 'Y of the point to scroll from, in window/screenshot coordinates.' },
      scrollX: { type: 'number', description: 'Horizontal delta in wheel notches; negative left, positive right.' },
      scrollY: { type: 'number', description: 'Vertical delta in wheel notches; negative up, positive down.' },
      screenshotId: { type: 'string', description: 'Screenshot id from the latest get_window_state for coordinate interpretation.' },
      relative: RELATIVE,
    },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      const params = stripUndefined({
        window: { id: window.id },
        x: Number(args.x),
        y: Number(args.y),
        scrollX: Number(args.scrollX ?? 0),
        scrollY: Number(args.scrollY ?? 0),
        screenshotId: args.screenshotId,
        relative: args.relative,
      });
      await gate(params, exec, { window, toolName: 'scroll' });
      const mapped = coordinateParams(params, window, exec);
      if (config.dryRun) return { dryRun: true, wouldScroll: mapped };
      const scrolled = await rpc('scroll', mapped, exec);
      markAction(window, exec);
      return scrolled;
    },
  ));

  tools.push(action(
    'drag',
    'Drag inside a window from one window-relative coordinate to another (selection, sliders, drag and drop).',
    {
      window: WINDOW_SCHEMA,
      from_x: { type: 'number', required: true, description: 'Start X, window-relative pixels.' },
      from_y: { type: 'number', required: true, description: 'Start Y, window-relative pixels.' },
      to_x: { type: 'number', required: true, description: 'End X, window-relative pixels.' },
      to_y: { type: 'number', required: true, description: 'End Y, window-relative pixels.' },
      screenshotId: { type: 'string', description: 'Screenshot id from the latest get_window_state for coordinate interpretation.' },
      relative: RELATIVE, modifiers: MODIFIERS, useSystemPointer: POINTER,
    },
    async (args, exec) => {
      assertKeyAllowed(args.modifiers?.join('+'));
      const window = await authorizeWindow(args, exec);
      const params = {
        window: { id: window.id },
        from_x: Number(args.from_x), from_y: Number(args.from_y),
        to_x: Number(args.to_x), to_y: Number(args.to_y),
        screenshotId: args.screenshotId,
        relative: args.relative, modifiers: args.modifiers, useSystemPointer: args.useSystemPointer,
      };
      await gate(params, exec, { window, toolName: 'drag', systemPointer: args.useSystemPointer === true });
      const mapped = coordinateParams(params, window, exec);
      if (config.dryRun) return { dryRun: true, wouldDrag: mapped };
      const dragged = await rpc('drag', mapped, exec);
      markAction(window, exec);
      return dragged;
    },
  ));

  tools.push(action(
    'set_value',
    'Replace the value of a value-bearing element (text box, combo, search field) directly through the accessibility Value pattern. Cheaper and more reliable than click + select-all + type_text when the element supports it.',
    {
      window: WINDOW_SCHEMA,
      element_index: { ...ELEMENT_INDEX_SCHEMA, required: true },
      value: { type: 'string', required: true, description: 'Replacement value for the element.' },
    },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      const params = { window: { id: window.id }, element_index: Number(args.element_index), value: String(args.value) };
      await gate(params, exec, { window, toolName: 'set_value' });
      if (config.dryRun) return { dryRun: true, wouldSetValue: params };
      const setValue = await rpc('set_value', params, exec);
      markAction(window, exec);
      return setValue;
    },
  ));

  tools.push(action(
    'perform_secondary_action',
    'Invoke a non-click accessibility action on an element: Raise, Invoke, Expand, Collapse, Toggle, Select, ScrollUp/ScrollDown/ScrollLeft/ScrollRight. Matching is case-insensitive.',
    {
      window: WINDOW_SCHEMA,
      element_index: { ...ELEMENT_INDEX_SCHEMA, required: true },
      action: { type: 'string', required: true, description: 'Action label, e.g. Expand or Scroll Down.' },
    },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      const params = { window: { id: window.id }, element_index: Number(args.element_index), action: String(args.action) };
      await gate(params, exec, { window, toolName: 'perform_secondary_action' });
      if (config.dryRun) return { dryRun: true, wouldPerform: params };
      const performed = await rpc('perform_secondary_action', params, exec);
      markAction(window, exec);
      return performed;
    },
  ));

  tools.push(action(
    'activate_window',
    'Bring an open window to the foreground. Input tools activate their target automatically; use this only to focus a window for the user or before a manual step.',
    { window: WINDOW_SCHEMA },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      await gate({}, exec, { window, toolName: 'activate_window' });
      if (config.dryRun) return { dryRun: true, wouldActivate: window.id };
      return rpc('activate_window', { window: { id: window.id } }, exec);
    },
  ));

  tools.push(action(
    'start_audio_recording',
    'Start recording the machine\'s audio output (WASAPI loopback) - useful when the task involves something that is said or played. Recording is capped by max_duration_ms and must be stopped with stop_audio_recording; the task must actually need the audio.',
    { max_duration_ms: { type: 'number', description: 'Hard cap in milliseconds (default 60000).' } },
    async (args, exec) => {
      if (!config.audio) throw new Error('audio recording is disabled for this plugin: set audio: true in the plugin config (or DSH_CU_AUDIO=1) and restart the host');
      if (config.dryRun) return { dryRun: true, wouldRecordAudio: true };
      // Codex elicits "Allow Computer Use to record computer audio?" before the first
      // recording of a session, separate from the per-app consent it asks for windows.
      const scope = scopeOf(exec);
      if (!scope.audioApproved) {
        await requestApproval(ctx, exec, {
          toolName: toolName('start_audio_recording'),
          reason: 'Allow Computer Use to record computer audio?',
        });
        scope.audioApproved = true;
      }
      return rpc('start_audio_recording', {
        maxDurationMs: Number(args.max_duration_ms ?? 60000),
        approvedApp: 'computer-audio',
        force: true,
      }, exec);
    },
  ));

  tools.push(action(
    'stop_audio_recording',
    'Stop the audio recording started by start_audio_recording and return the WAV file path plus the raw 24 kHz stereo WAV bytes (base64) and data URL.',
    {},
    async (_args, exec) => rpc('stop_audio_recording', {}, exec),
  ));

  tools.push(action(
    'computer_use_health',
    'Self-check for the Computer Use plugin: helper path and build state, Windows version, UI Automation availability, resolved policy (approval mode, app lists, dry-run) and live window count. Run this first when a Computer Use call fails unexpectedly.',
    {},
    async (args, exec) => {
      const ping = await rpc('ping', {}, exec);
      let windows = null;
      try {
        const listed = await rpc('list_windows', {}, exec);
        windows = listed?.count ?? (listed?.windows?.length ?? null);
      } catch (error) {
        windows = 'unavailable: ' + error.message;
      }
      return {
        ok: true,
        platform: ping?.platform ?? 'unknown',
        pid: ping?.pid ?? null,
        overlayPid: ping?.overlayPid ?? null,
        helper: deps.describeHelper?.() ?? null,
        windows,
        policy: {
          approval: config.approval,
          allowApps: config.allowApps,
          denyApps: config.denyApps,
          dryRun: config.dryRun,
          defaultIncludeScreenshot: config.defaultIncludeScreenshot,
          maxElements: config.maxElements,
          snapshotTtlMs: config.snapshotTtlMs,
          settleMs: config.settleMs,
          appConsent: config.appConsent,
          audio: config.audio,
          toolPrefix: config.toolPrefix,
          hardDeniedApps: 'terminals, Run dialog, password managers, security software, auth dialogs, agent host',
          hardDeniedKeys: 'Windows/Meta/Super key family',
        },
      };
    },
  ));

  deps.onShowWindow?.(action('show_window', 'Restore this window without activating it.', { window: WINDOW_SCHEMA },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      await gate({}, exec, { window, toolName: 'show_window' });
      if (config.dryRun) return { dryRun: true, wouldShow: window.id };
      return rpc('show_window', { window: { id: window.id } }, exec);
    }));

  return tools;
}

function stripUndefined(value) {
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out;
}

/**
 * Persist captured PNGs through the DSH attachments service so the model gets
 * image blocks instead of base64 blobs. A window state can carry several
 * screenshots (the window plus open menus/tooltips), each with its own id and
 * screen origin so coordinates can be interpreted later.
 */
export function fixedScreenshotTarget(configured, image) {
  if (!configured || !(image?.width > 0 && image?.height > 0)) return undefined;
  const scale = Math.min(1, configured.longEdge / Math.max(image.width, image.height));
  return { ...configured, width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) };
}

function screenshotDiagnostic(shot, ref, elapsed) {
  const native = shot.diagnostic;
  const stages = {};
  if (['wgc', 'PrintWindow', 'BitBlt'].includes(native?.stages?.backend)) stages.backend = native.stages.backend;
  for (const field of ['geometryCheckMs', 'captureMs', 'encodePngMs']) {
    if (Number.isFinite(native?.stages?.[field])) stages[field] = native.stages[field];
  }
  return {
    requestId: Number.isSafeInteger(native?.requestId) ? native.requestId : null,
    stages: { ...stages, attachmentAdmitMs: Math.round(elapsed) },
    originalSize: Array.isArray(native?.originalSize) && native.originalSize.length === 2
      && native.originalSize.every(Number.isSafeInteger) ? native.originalSize : [shot.width, shot.height],
    deliveredSize: [ref?.width ?? shot.width, ref?.height ?? shot.height],
  };
}

async function attachScreenshots(ctx, screenshots, window, configuredTarget, exec, deps) {
  const attachments = service(ctx, 'attachments');
  const usable = attachments !== undefined && attachments !== null && typeof attachments.saveImage === 'function';
  const out = [];
  for (const shot of screenshots) {
    const base = {
      id: shot.id,
      zIndex: shot.zIndex,
      originX: shot.originX,
      originY: shot.originY,
      width: shot.width,
      height: shot.height,
      scaleX: shot.scaleX ?? 1,
      scaleY: shot.scaleY ?? 1,
    };
    if (typeof shot.base64 !== 'string') {
      out.push(base);
      continue;
    }
    if (!usable) {
      out.push({ ...base, note: 'no attachment service is mounted, so the image bytes were dropped' });
      continue;
    }
    const started = performance.now();
    let ref;
    let configured;
    try {
      const name = 'computer-use-' + (window?.id ?? 'window') + '-' + shot.id + '.png';
      ref = await attachments.saveImage({ data: Buffer.from(shot.base64, 'base64'), mediaType: 'image/png', name });
      exec.signal?.throwIfAborted();
      configured = fixedScreenshotTarget(configuredTarget, ref);
      if (configured && typeof attachments.readImageRequest === 'function') {
        const version = await attachments.readImageRequest(ref, configured, exec.signal);
        exec.signal?.throwIfAborted();
        ref = await attachments.saveImage({ data: Buffer.from(version.data), mediaType: version.mediaType, name, target: configured });
      }
      exec.signal?.throwIfAborted();
    } catch (error) {
      const trace = JSON.stringify(screenshotDiagnostic(shot, ref, performance.now() - started));
      if (exec.signal?.aborted) throw exec.signal.reason;
      throw new PolicyError(error.code ?? 'attachment_failed', 'Could not admit the window screenshot [cua-screenshot] ' + trace.slice(0, 8192));
    }
    const diagnostic = screenshotDiagnostic(shot, ref, performance.now() - started);
    deps.screenshotTrace?.(diagnostic);
    const scaleX = base.scaleX * (base.width / (ref.width ?? base.width));
    const scaleY = base.scaleY * (base.height / (ref.height ?? base.height));
    if (configured) deps.mapScreenshot?.(ref, {
      ...configured, width: ref.width, height: ref.height, scaleX, scaleY,
    });
    out.push({
      ...base,
      attachmentId: ref.attachmentId,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
      width: ref.width ?? base.width,
      height: ref.height ?? base.height,
      scaleX, scaleY, diagnostic,
      attachment: {
        attachmentId: ref.attachmentId,
        mediaType: ref.mediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name ?? 'computer-use.png',
      },
    });
  }
  return out;
}
