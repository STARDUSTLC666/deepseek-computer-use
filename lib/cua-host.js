import { randomUUID } from 'node:crypto';
import { appKey } from './access.js';
import { assertArguments } from './parameters.js';
import { assertAppAllowed, assertNotHardDenied, assertTurnOpen, PolicyError, service } from './safety.js';

const objectSchema = { type: 'object', additionalProperties: true };
const operations = [
  'getCapabilities', 'listApps', 'getState', 'getApp', 'getWindows', 'getWindow', 'activate', 'show',
  'getAccessibilityTree', 'getScreenshot', 'click', 'mouseMove', 'drag', 'scroll', 'type', 'pressKey',
];
const requestSchema = {
  type: 'object', required: ['method', 'params'], additionalProperties: false,
  properties: { method: { type: 'string', enum: operations }, params: objectSchema },
};
const bridgeUrl = new URL('./cua-bridge.js', import.meta.url).href;
const initializer = 'globalThis.cua ??= (await import(' + JSON.stringify(bridgeUrl) + ')).connectCua(() => tools.cua);';
const text = value => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) });

function targetArgs(target) {
  if (typeof target === 'number') return { element_index: target };
  if (Number.isInteger(target?.element_index ?? target?.elementIndex)) return { element_index: target.element_index ?? target.elementIndex };
  if (typeof target?.elementId === 'string' && /^\d+$/.test(target.elementId)) return { element_index: Number(target.elementId) };
  if (typeof target?.elementId === 'number') return { element_index: target.elementId };
  if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    return { x: target.x, y: target.y, ...(typeof target.screenshotId === 'string' ? { screenshotId: target.screenshotId } : {}) };
  }
  throw new PolicyError('invalid_arguments', 'Select an element index or a point with x and y');
}

function options(params, keys) {
  const out = {};
  for (const key of keys) if (params.options?.[key] !== undefined) out[key] = params.options[key];
  return out;
}

function windowOperations(run, params) {
  const point = value => targetArgs(value);
  return {
    async getAccessibilityTree() {
      const { includeMenus, maxDepth, ...rest } = options(params, ['includeMenus', 'maxDepth', 'details', 'maxElements']);
      const state = await run('get_window_state', { include_text: true, include_screenshot: false, ...rest,
        ...(includeMenus === undefined ? {} : { include_menus: includeMenus }),
        ...(maxDepth === undefined ? {} : { max_depth: maxDepth }) });
      return state.accessibility;
    },
    async getScreenshot() {
      const state = await run('get_window_state', { include_text: false, include_screenshot: true, ...options(params, ['region']) });
      const shot = state.screenshots?.[0];
      if (!shot?.attachment) throw new PolicyError('SCREENSHOT_UNAVAILABLE', 'No screenshot attachment was delivered');
      return { ...shot.attachment, screenshotId: shot.id, originX: shot.originX, originY: shot.originY };
    },
    click: () => run('click', { ...point(params.target), ...options(params, ['mouseButton', 'clickCount', 'holdMs', 'modifiers', 'relative']) }),
    mouseMove: () => run('mouse_move', { ...point(params.target), ...options(params, ['relative', 'useSystemPointer']) }),
    drag: () => {
      const from = point(params.from), to = point(params.to);
      if ((from.screenshotId ?? to.screenshotId) !== (to.screenshotId ?? from.screenshotId)) {
        throw new PolicyError('invalid_arguments', 'Use one screenshot coordinate space for the complete drag');
      }
      return run('drag', { from_x: from.x, from_y: from.y, to_x: to.x, to_y: to.y,
        ...(from.screenshotId || to.screenshotId ? { screenshotId: from.screenshotId ?? to.screenshotId } : {}),
        ...options(params, ['relative', 'useSystemPointer', 'modifiers']) });
    },
    scroll: () => run('scroll', { ...point(params.point ?? params), scrollX: params.delta?.x ?? -Number(params.deltaLinesX ?? 0),
      scrollY: typeof params.delta === 'number' ? params.delta : params.delta?.y ?? -Number(params.deltaLinesY ?? 0),
      ...options(params, ['relative']) }),
    type: () => run('type_text', { text: params.text }),
    pressKey: () => {
      if (typeof params.key !== 'string') throw new PolicyError('invalid_arguments', 'Specify a key name');
      const modifiers = params.options?.modifiers ?? [];
      if (!Array.isArray(modifiers) || !modifiers.every(key => typeof key === 'string')) {
        throw new PolicyError('invalid_arguments', 'Key modifiers must be an array of names');
      }
      return run('press_key', { key: [...modifiers, params.key].join('+') });
    },
    activate: () => run('activate_window'),
    show: () => run('show_window'),
  };
}

/** Install one authorization and native-dispatch path for raw CUA, run_code and standalone PTC. */
export function installCua(ctx, { config, access, execute, releaseSession, draining, scopeSignal,
  ptcRuntime = () => service(ctx, 'ptcRuntime'), preparePtc = ptcRuntime }) {
  const owners = new Map();
  const unscoped = {};
  const sessionOf = exec => exec?.agent?.session ?? unscoped;

  function ownerFor(exec) {
    const session = sessionOf(exec);
    let owner = owners.get(session);
    if (!owner) {
      owner = { apps: new Map(), controller: new AbortController(), pending: new Set(), runtime: null };
      owners.set(session, owner);
    }
    return owner;
  }

  function assertActive(exec) {
    if (draining()) throw new PolicyError('PROVIDER_SHUTTING_DOWN', 'Computer Use provider is shutting down');
    exec.signal?.throwIfAborted();
  }

  async function dispatch(request, exec) {
    assertArguments(requestSchema, request);
    assertActive(exec);
    if (request.method === 'getCapabilities') {
      return { platform: 'windows', accessibilityScope: 'window', keyboardScope: 'window',
        supportsLaunchApp: true, supportsSystemPointer: true, supportsAudioRecording: config.audio,
        supportsRelativeCoordinates: true, maxClickHoldMs: config.maxClickHoldMs };
    }
    const { method, params } = request;
    const owner = ownerFor(exec);
    exec = { ...exec, signal: exec.signal ? AbortSignal.any([exec.signal, owner.controller.signal]) : owner.controller.signal };
    const apps = async () => (await execute('list_apps', {}, exec)).apps;
    if (method === 'listApps' || method === 'getState') {
      const list = (await apps()).map(({ id, displayName, isRunning, executablePath, aumid, windowCount, windows }) =>
        ({ id, displayName, isRunning, executablePath, aumid, windowCount: windowCount ?? windows?.length ?? 0 }));
      return method === 'listApps' ? list : { apps: list, browsers: [] };
    }
    if (method === 'getApp') {
      const id = params.id ?? params.appId;
      if (!appKey(id)) throw new PolicyError('invalid_arguments', 'Select an application ID from listApps');
      const app = (await apps()).find(item => appKey(item.id) === appKey(id));
      if (!app) throw new PolicyError('APP_NOT_FOUND', 'The selected application is no longer running');
      assertNotHardDenied({ app });
      assertAppAllowed(config, app);
      assertTurnOpen(exec);
      const identity = await access.ensure(app, exec, { toolName: config.toolPrefix + 'cua' });
      assertActive(exec);
      access.assertGeneration(identity.id, identity.generation);
      if (owner.apps.size >= 256) throw new PolicyError('APP_HANDLE_LIMIT', 'Release retained CUA state before selecting another application');
      const appHandle = randomUUID();
      owner.apps.set(appHandle, identity);
      return { ...identity, appHandle };
    }
    const app = owner.apps.get(params.appHandle);
    if (!app) throw new PolicyError('APP_ACCESS_REQUIRED', 'Select the application with getApp first');
    await access.refresh();
    access.assertGeneration(app.id, app.generation);
    const windows = async () => {
      const result = await execute('list_windows', {}, exec);
      access.assertGeneration(app.id, app.generation);
      return result.windows.filter(window => appKey(window.app?.id) === appKey(app.id));
    };
    if (method === 'getWindows') return windows();
    let windowId = params.windowId;
    if (windowId === undefined && (method === 'activate' || method === 'show')) {
      const list = await windows();
      if (!list.length) throw new PolicyError('WINDOW_NOT_FOUND', 'The application has no visible window');
      if (method === 'show' && list.length > 1) throw new PolicyError('AMBIGUOUS_WINDOW', 'Select the window explicitly');
      windowId = list[0].id;
    }
    if (!Number.isSafeInteger(windowId) || windowId <= 0) throw new PolicyError('WINDOW_NOT_FOUND', 'Choose a window from getWindows');
    const run = (tool, args = {}) => execute(tool, { ...args, window: { id: windowId } },
      { ...exec, appId: app.id, appGeneration: app.generation });
    if (method === 'getWindow') {
      // Revalidate membership without activating the window or replacing a snapshot.
      if (!(await windows()).some(window => window.id === windowId)) {
        throw new PolicyError('WINDOW_NOT_FOUND', 'The selected window no longer belongs to the application');
      }
      return { windowId };
    }
    const result = await windowOperations(run, params)[method]();
    access.assertGeneration(app.id, app.generation);
    return result;
  }

  const name = config.toolPrefix + 'cua';
  const raw = {
    name, description: 'Windows Computer Use object bridge. Discover, select an app, then inspect or act on a window using the returned appHandle.',
    parameters: requestSchema,
    output: { schema: {}, render: (args, value) => args.method === 'getScreenshot' && value?.attachmentId
      ? [text({ screenshotId: value.screenshotId, width: value.width, height: value.height }), { type: 'image', attachment: value }]
      : [text(value)] },
    isConcurrencySafe: () => false,
    execute: (args, exec = {}) => dispatch(args, { ...exec, signal: scopeSignal?.(exec) ?? exec.signal }),
  };

  const program = {
    name: config.toolPrefix + 'cua_run_code',
    description: 'Run a TypeScript program with the retained cua object and inspect(text or images). The program uses the configured Harness PTC runtime.',
    parameters: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: { type: 'string' } } },
    output: { schema: objectSchema, render: (_args, value) => [
      text({ logs: value.logs, ...(value.result === undefined ? {} : { result: value.result }) }),
      ...value.display.map(value => typeof value === 'string' ? text(value) : { type: 'image', attachment: value }),
    ] },
    isConcurrencySafe: () => false,
    async execute(args, exec = {}) {
      assertArguments(program.parameters, args);
      exec = { ...exec, signal: scopeSignal?.(exec) ?? exec.signal };
      assertActive(exec);
      const runtime = await preparePtc();
      assertActive(exec);
      if (runtime?.language !== 'typescript') throw new PolicyError('PTC_UNAVAILABLE', 'A TypeScript PTC runtime is required');
      if (args.code.length > 65536) throw new PolicyError('invalid_arguments', 'CUA program source exceeds 64 KiB');
      const owner = ownerFor(exec);
      const controller = new AbortController();
      const signals = [owner.controller.signal, controller.signal, ...(exec.signal ? [exec.signal] : [])];
      const signal = AbortSignal.any(signals);
      const pending = new Set();
      const images = new Map();
      const display = [];
      let subcalls = 0;
      const execute = async () => {
        const cwd = exec.agent ? await service(ctx, 'workingDirectory')?.ensure(exec.agent, signal) : undefined;
        if (exec.agent && !cwd) throw new PolicyError('PTC_UNAVAILABLE', 'Harness workingDirectory is required for a session program');
        const resolver = service(ctx, 'sandboxPolicy');
        if (runtime.sandboxMode !== undefined && !resolver) throw new PolicyError('PTC_UNAVAILABLE', 'Harness sandboxPolicy is required for this runtime');
        const policy = runtime.sandboxMode === undefined ? undefined : resolver.resolve(exec.agent ? { session: exec.agent.session } : {});
        const spec = runtime.resolve({
          program: initializer + '\nglobalThis.inspect = (...values) => cuOutput.inspect(values);\n' + args.code,
          stateOwner: owner, cwd, sandboxPolicy: policy, signal,
          bindings: [
            { global: 'tools', functions: { cua: request => {
              signal.throwIfAborted();
              if (++subcalls > 100) throw new PolicyError('PTC_LIMIT', 'Computer Use program exceeded its tool call budget');
              const operation = dispatch(request, { ...exec, signal }).then(value => {
                if (request.method === 'getScreenshot' && value?.attachmentId) images.set(value.attachmentId, value);
                return value;
              });
              pending.add(operation);
              const remove = () => pending.delete(operation);
              operation.then(remove, remove);
              return operation;
            } } },
            { global: 'cuOutput', functions: { inspect: async values => {
              signal.throwIfAborted();
              if (!Array.isArray(values)) throw new PolicyError('invalid_arguments', 'inspect expects a list of values');
              for (const item of values.slice(0, Math.max(0, 16 - display.length))) {
                const image = images.get(item?.attachmentId);
                display.push(image ?? (typeof item === 'string' ? item : JSON.stringify(item) ?? String(item)).slice(0, 4096));
              }
              return null;
            } } },
          ],
        });
        owner.runtime = runtime;
        const result = await runtime.run(spec);
        if (result.error) throw new PolicyError('PTC_FAILED', result.error.message);
        signal.throwIfAborted();
        return { logs: (result.logs ?? []).slice(0, 100), result: result.value, display };
      };
      const operation = execute().finally(async () => {
        controller.abort();
        await Promise.allSettled([...pending]);
      });
      owner.pending.add(operation);
      const remove = () => owner.pending.delete(operation);
      operation.then(remove, remove);
      return operation;
    },
  };

  async function release(agent, { closeNative = true } = {}) {
    const session = agent?.session ?? unscoped;
    const owner = owners.get(session);
    if (owner) {
      owner.controller.abort(new PolicyError('APP_ACCESS_REVOKED', 'The CUA environment was released'));
      try { await Promise.all([owner.runtime?.release(owner), Promise.allSettled(owner.pending)]); }
      finally { if (owners.get(session) === owner) owners.delete(session); }
    }
    if (closeNative) await releaseSession(session === unscoped ? undefined : session);
  }

  return {
    raw, program, release, runtimeAvailable: () => ptcRuntime()?.language === 'typescript',
    dispose: () => Promise.allSettled([...owners.keys()].map(session => release(session === unscoped ? undefined : { session }, { closeNative: false }))),
    prompt: 'In run_code, initialize the retained Windows CUA API with:\n'
      + 'var { connectCua } = await import(' + JSON.stringify(bridgeUrl) + ');\n'
      + 'var cua = connectCua(() => tools[' + JSON.stringify(name) + ']);\n'
      + 'Use cua.listApps(), cua.getApp(id), app.getWindows() and app.getWindow(id). Read a fresh accessibility tree before using element IDs.',
  };
}
