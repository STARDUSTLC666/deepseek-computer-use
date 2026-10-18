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
} from './safety.js';
import { assertArguments, compileParameters } from './parameters.js';
import { setTimeout as delay } from 'node:timers/promises';

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

function json(value) {
  return { type: 'text', text: JSON.stringify(value, null, 2) };
}

function describeWindow(window) {
  const title = window?.title ? '"' + window.title + '"' : '(untitled)';
  const app = window?.app?.name ?? window?.app?.id ?? 'unknown';
  return app + ' | ' + title + ' | id=' + window?.id;
}

export function buildTools(config, deps) {
  const { request, ctx, log, states } = deps;
  const scopes = new WeakMap();
  const createScope = () => ({ consentedApps: new Set(), audioApproved: false, lastActionAt: new Map(), states: new Map(), shots: new Map(), primaryShots: new Map(), invalidWindows: new Set(), observedWindows: new Set() });
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
    'set_value', 'perform_secondary_action', 'activate_window', 'start_audio_recording']);
  const observedInputs = new Set(['click', 'press_key', 'type_text', 'scroll', 'drag', 'set_value', 'perform_secondary_action']);

  /**
   * Codex asks the user to allow Computer Use per application before it drives
   * one ("Computer Use was not approved to use <app>"). Same idea here, once per
   * app for the lifetime of the plugin, and it fails closed.
   */
  async function ensureAppConsent(window, exec) {
    if (config.appConsent === 'never') return;
    const { consentedApps } = scopeOf(exec);
    const app = window?.app ?? {};
    const key = String(app.id ?? app.name ?? window?.id ?? 'unknown');
    if (!consentedApps.has(key)) {
      await requestApproval(ctx, exec, {
        toolName: toolName('get_window_state'),
        reason: 'Computer Use is about to drive "' + (app.displayName ?? app.name ?? key) + '" (' + key + '). Approve this app for the session.',
      });
    }
    // Tell the helper, which enforces the same fact on its side (Codex does this
    // through x-oai-cua-approved-app on every request).
    // Re-send the grant so a restarted helper can recover without another prompt.
    // Cache only after acknowledgement; a failed grant must remain a failed call.
    await request('approve_app', { app: key }, callOpts(exec));
    consentedApps.add(key);
  }
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
      scope.turnToken = turnToken;
    }
    return { signal: exec?.signal, turnToken, session: exec?.agent?.session };
  };
  const coordinateParams = (params, window, exec) => {
    const scope = scopeOf(exec);
    const id = params.screenshotId ?? scope.primaryShots.get(Number(window.id));
    const shot = scope.shots.get(id);
    if (!shot || shot.windowId !== Number(window.id)) return params;
    const mapped = { ...params };
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
    const info = await request('get_window', { window: { id } }, callOpts(exec));
    // Gate 1 runs first: some surfaces are never automatable, approved or not.
    assertNotHardDenied(info?.window ?? {});
    assertAppAllowed(config, info?.window?.app ?? {}, info?.window ?? {});
    await ensureAppConsent(info.window, exec);
    return info.window;
  }

  async function gate(action, exec, { window, toolName: tool, label, reason }) {
    assertTurnOpen(exec);
    const state = window?.id !== undefined ? scopeOf(exec).states.get(Number(window.id)) : undefined;
    const targetLabel = label ?? labelOfElement(state, action?.element_index);
    if (needsApproval(config, { toolName: tool, label: targetLabel })) {
      await requestApproval(ctx, exec, {
        toolName: tool,
        reason: reason ?? ('Windows UI action in ' + describeWindow(window) + (targetLabel ? ' on "' + targetLabel.trim() + '"' : '')),
      });
    }
  }

  function action(name, description, parameters, run) {
    const schema = compileParameters(parameters);
    return {
      name: toolName(name),
      description,
      parameters: schema,
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [json(value)] },
      isConcurrencySafe: () => false,
      execute: (args, exec) => {
        const execute = async () => {
          assertArguments(schema, args);
          exec?.signal?.throwIfAborted();
          if (inputTools.has(name)) assertTurnOpen(exec);
          const scope = scopeOf(exec);
          const windowId = Number(args?.window?.id);
          if (observedInputs.has(name) && scope.invalidWindows.has(windowId)) {
            throw Object.assign(new Error('the previous input or observation failed; call get_window_state again and inspect the new state before retrying input'), { code: 'fresh_observation_required' });
          }
          try {
            const value = await run(args, exec);
            if (name === 'get_window_state') {
              scope.invalidWindows.delete(windowId);
              scope.observedWindows.add(windowId);
            }
            return value;
          } catch (error) {
            if (inputTools.has(name) || name === 'get_window_state') {
              for (const id of scope.observedWindows) scope.invalidWindows.add(id);
              scope.states.clear();
              scope.shots.clear();
              scope.primaryShots.clear();
              if (Number.isFinite(windowId)) scope.invalidWindows.add(windowId);
              if (!['cancelled_by_user', 'turn_stopped', 'turn_ended', 'cancelled', 'AbortError'].includes(error.code ?? error.name)) {
                error.message += ' Re-observe with get_window_state before retrying; the previous input outcome may be unknown.';
              }
            }
            throw error;
          }
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
    async (args, exec) => request('list_windows', {}, callOpts(exec)),
  ));

  tools.push(action(
    'list_apps',
    'List installed apps that currently own a targetable window, each with its open windows. Prefer this over list_windows when the task names an application rather than a window.',
    {},
    async (args, exec) => request('list_apps', {}, callOpts(exec)),
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
        if (config.dryRun) return { dryRun: true, wouldLaunch: args.app };

        if (needsApproval(config, { toolName: 'launch_app' })) {
          await requestApproval(ctx, exec, { toolName: toolName('launch_app'), reason: 'launch application "' + args.app + '"' + (Array.isArray(args.args) && args.args.length > 0 ? ' with arguments ' + args.args.join(' ') : '') });
        }
        return request('launch_app', stripUndefined({ app: args.app, args: Array.isArray(args.args) ? args.args.map(String) : undefined }), callOpts(exec));
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
      },
      async (args, exec) => {
        const window = await authorizeWindow(args, exec);
        const includeText = args.include_text === true;
        const redacted = isRedacted(config, window.app);
        const includeShot = redacted ? false : (args.include_screenshot === undefined ? config.defaultIncludeScreenshot : args.include_screenshot === true);
        if (!includeText && !includeShot) throw new Error('get_window_state must request include_text, include_screenshot, or both');
        // Codex waits for the UI to settle before capturing after an action; the
        // harness-side equivalent is a short settle window here.
        const scope = scopeOf(exec);
        const last = scope.lastActionAt.get(Number(window.id));
        if (last !== undefined) {
          const wait = Math.min(config.settleMs, config.settleMs - (Date.now() - last));
          if (wait > 0) await delay(wait, undefined, { signal: exec?.signal });
        }
        const result = await request('get_window_state', {
          window: { id: window.id },
          include_text: includeText,
          include_screenshot: includeShot,
          maxElements: Number.isFinite(Number(args.maxElements)) ? Number(args.maxElements) : config.maxElements,
          ttlMs: config.snapshotTtlMs,
        }, callOpts(exec));
        if (result?.accessibility) {
          scope.states.set(Number(window.id), { ...result.accessibility, at: Date.now() });
        }
        if (redacted) {
          // appshot guard: never let these pixels leave the machine
          result.redacted = true;
          result.redactedNote = 'screenshots are disabled for this application by the redactApps policy';
          result.screenshots = [];
        } else if (Array.isArray(result?.screenshots)) {
          // Attachment normalization can resize a captured window. The model aims
          // in the stored image, while the helper owns the original capture pixels.
          for (const [id, shot] of scope.shots) {
            if (shot.windowId === Number(window.id)) scope.shots.delete(id);
          }
          const attached = await attachScreenshots(ctx, result.screenshots, window);
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
        screenshotId: { type: 'string', description: 'Screenshot id from the latest get_window_state; when supplied, x/y are interpreted in that screenshot region (needed for a menu or tooltip screenshot).' },
      },
      async (args, exec) => {
        const window = await authorizeWindow(args, exec);
        const params = {
          window: { id: window.id },
          element_index: args.element_index === undefined ? undefined : Number(args.element_index),
          x: args.x === undefined ? undefined : Number(args.x),
          y: args.y === undefined ? undefined : Number(args.y),
          click_count: args.click_count === undefined ? 1 : Number(args.click_count),
          mouse_button: args.mouse_button ?? 'left',
        };
        params.screenshotId = args.screenshotId;
        await gate(params, exec, { window, toolName: 'click' });
        if (config.dryRun) return { dryRun: true, wouldClick: params };
        const clicked = await request('click', stripUndefined(coordinateParams(params, window, exec)), callOpts(exec));
        markAction(window, exec);
        return clicked;
      },
    ),
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [json(value)] },
  });

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
      const pressed = await request('press_key', { window: { id: window.id }, key: args.key }, callOpts(exec));
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
      const typed = await request('type_text', { window: { id: window.id }, text: String(args.text) }, callOpts(exec));
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
      });
      await gate(params, exec, { window, toolName: 'scroll' });
      if (config.dryRun) return { dryRun: true, wouldScroll: params };
      const scrolled = await request('scroll', coordinateParams(params, window, exec), callOpts(exec));
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
    },
    async (args, exec) => {
      const window = await authorizeWindow(args, exec);
      const params = {
        window: { id: window.id },
        from_x: Number(args.from_x), from_y: Number(args.from_y),
        to_x: Number(args.to_x), to_y: Number(args.to_y),
        screenshotId: args.screenshotId,
      };
      await gate(params, exec, { window, toolName: 'drag' });
      if (config.dryRun) return { dryRun: true, wouldDrag: params };
      const dragged = await request('drag', stripUndefined(coordinateParams(params, window, exec)), callOpts(exec));
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
      const setValue = await request('set_value', params, callOpts(exec));
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
      const performed = await request('perform_secondary_action', params, callOpts(exec));
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
      if (config.dryRun) return { dryRun: true, wouldActivate: window.id };
      return request('activate_window', { window: { id: window.id } }, callOpts(exec));
    },
  ));

  tools.push(action(
    'start_audio_recording',
    'Start recording the machine\'s audio output (WASAPI loopback) - useful when the task involves something that is said or played. Recording is capped by max_duration_ms and must be stopped with stop_audio_recording; the task must actually need the audio.',
    { max_duration_ms: { type: 'number', description: 'Hard cap in milliseconds (default 60000).' } },
    async (args, exec) => {
      if (!config.audio) throw new Error('audio recording is disabled for this plugin: set audio: true in the plugin config (or DSH_CU_AUDIO=1) and restart the host');
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
      return request('start_audio_recording', {
        maxDurationMs: Number(args.max_duration_ms ?? 60000),
        approvedApp: 'computer-audio',
        force: true,
      }, callOpts(exec));
    },
  ));

  tools.push(action(
    'stop_audio_recording',
    'Stop the audio recording started by start_audio_recording and return the WAV file path plus the raw 24 kHz stereo WAV bytes (base64) and data URL.',
    {},
    async (args, exec) => request('stop_audio_recording', {}, callOpts(exec)),
  ));

  tools.push(action(
    'computer_use_health',
    'Self-check for the Computer Use plugin: helper path and build state, Windows version, UI Automation availability, resolved policy (approval mode, app lists, dry-run) and live window count. Run this first when a Computer Use call fails unexpectedly.',
    {},
    async (args, exec) => {
      const ping = await request('ping', {}, callOpts(exec));
      let windows = null;
      try {
        const listed = await request('list_windows', {}, callOpts(exec));
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
async function attachScreenshots(ctx, screenshots, window) {
  const attachments = ctx?.get?.('attachments');
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
    };
    if (typeof shot.base64 !== 'string') {
      out.push(base);
      continue;
    }
    if (!usable) {
      out.push({ ...base, note: 'no attachment service is mounted, so the image bytes were dropped' });
      continue;
    }
    const data = Buffer.from(shot.base64, 'base64');
    const ref = await attachments.saveImage({
      data,
      mediaType: 'image/png',
      name: 'computer-use-' + (window?.id ?? 'window') + '-' + shot.id + '.png',
    });
    out.push({
      ...base,
      attachmentId: ref.attachmentId,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
      width: ref.width ?? base.width,
      height: ref.height ?? base.height,
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
