import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { apply, buildTools, resolveConfig } from '../lib/index.js';
import { requestApproval } from '../lib/safety.js';
import { buildCleanWin32Env } from '../lib/bridge.js';
import { createAccess } from '../lib/access.js';
import { connectCua, installCua } from '../lib/api.js';
import { probeRegistries } from '../lib/updater.js';

const window = { id: 123, title: 'Fixture', app: { id: 'fixture.exe', name: 'fixture' } };
function setup(config = {}, services = {}) {
  const calls = [];
  const approvals = [];
  const tools = buildTools(resolveConfig(config), {
    states: new Map(),
    ctx: { get: name => services[name] ?? (name === 'approval' ? {
      request: async req => { approvals.push(req); return 'allowed-once'; },
    } : undefined) },
    request: async (method, params) => {
      calls.push({ method, params });
      return method === 'get_window' ? { window } : { ok: true };
    },
  });
  return { tools: new Map(tools.map(tool => [tool.name, tool])), calls, approvals };
}

test('all tool parameters are compiled object-rooted JSON Schema', () => {
  const { tools } = setup();
  assert.equal(tools.size, 17);
  for (const tool of tools.values()) {
    assert.equal(tool.parameters.type, 'object', tool.name);
    assert.equal(typeof tool.parameters.properties, 'object', tool.name);
  }
  const schema = tools.get('click').parameters;
  assert.ok(schema.required.includes('window'));
  assert.deepEqual(schema.properties.window.required, ['id']);
  assert.equal(schema.properties.window.properties.id.required, undefined);
});

test('a returned window and an id-only binding can be passed back unchanged', async () => {
  const { tools } = setup({ dryRun: true });
  assert.equal((await tools.get('click').execute({ window, x: 1, y: 2 }, {})).dryRun, true);
  assert.equal((await tools.get('click').execute({ window: { id: 123 }, x: 1, y: 2 }, {})).dryRun, true);
});

test('malformed model arguments fail before any helper request', async () => {
  const { tools, calls } = setup({ dryRun: true });
  for (const [name, args] of [
    ['click', {}],
    ['click', { window: { id: '123' }, x: 1, y: 2 }],
    ['scroll', { window, scrollY: 3 }],
    ['set_value', { window, element_index: 1, value: null }],
    ['click', { window, x: 1, y: 2, mouse_button: 'other' }],
  ]) {
    await assert.rejects(() => tools.get(name).execute(args, {}), { code: 'invalid_arguments' });
  }
  assert.deepEqual(calls, []);
});

test('DSH approval never policy still goes through its rejecting service', async () => {
  let requests = 0;
  const ctx = { get: () => ({
    effectivePolicy: () => 'never',
    request: async () => { requests += 1; return 'rejected'; },
  }) };
  await assert.rejects(() => requestApproval(ctx, {}, { toolName: 'click', reason: 'Delete all' }), { code: 'approval_denied' });
  assert.equal(requests, 1);
});

test('app consent is isolated by DSH session and reused within that session', async () => {
  const { tools, approvals } = setup({ dryRun: true });
  const a = { agent: { session: { id: 'a' } } };
  const b = { agent: { session: { id: 'b' } } };
  const args = { window, x: 1, y: 2 };
  await tools.get('click').execute(args, a);
  await tools.get('click').execute(args, a);
  await tools.get('click').execute(args, b);
  assert.equal(approvals.length, 2);
});

test('a failed helper consent grant is reported and does not cache approval', async () => {
  let grants = 0;
  let prompts = 0;
  const tools = buildTools(resolveConfig({ dryRun: true }), {
    states: new Map(),
    ctx: { get: () => ({ request: async () => { prompts += 1; return 'allowed-once'; } }) },
    request: async method => {
      if (method === 'get_window') return { window };
      if (method === 'approve_app') { grants += 1; throw Object.assign(new Error('helper restarted'), { code: 'helper_exited' }); }
      return {};
    },
  });
  const getWindow = tools.find(tool => tool.name === 'get_window');
  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => getWindow.execute({ window }, {}), { code: 'helper_exited' });
  }
  assert.equal(grants, 2);
  assert.equal(prompts, 2);
});

test('an uncertain input requires a new observation and cannot be blindly retried', async () => {
  let clicks = 0;
  let failCapture = false;
  const tools = new Map(buildTools(resolveConfig({ appConsent: 'never', approval: 'never' }), {
    states: new Map(), ctx: {},
    request: async method => {
      if (method === 'get_window') return { window };
      if (method === 'click') {
        clicks++;
        if (clicks === 1) throw Object.assign(new Error('reply lost after input'), { code: 'helper_exited' });
        return { clicked: true };
      }
      if (method === 'get_window_state') {
        if (failCapture) throw Object.assign(new Error('capture failed'), { code: 'capture_failed' });
        return { window, accessibility: { tree: 'fresh', elements: [] }, screenshots: [] };
      }
      return {};
    },
  }).map(tool => [tool.name, tool]));
  const click = () => tools.get('click').execute({ window, x: 1, y: 2 }, {});
  await assert.rejects(click, { code: 'helper_exited' });
  await assert.rejects(click, { code: 'fresh_observation_required' });
  failCapture = true;
  await assert.rejects(() => tools.get('get_window_state').execute({ window, include_text: true }, {}), { code: 'capture_failed' });
  await assert.rejects(click, { code: 'fresh_observation_required' });
  assert.equal(clicks, 1, 'No repeated native input before a successful refresh');
  failCapture = false;
  await tools.get('get_window_state').execute({ window, include_text: true }, {});
  await click();
  assert.equal(clicks, 2);
});

test('launch and activation stop when the requesting turn has ended', async () => {
  const { tools, calls } = setup({ dryRun: true });
  const exec = { agent: { session: { seq: 1, eventAt: () => ({ type: 'turn/end' }) } } };
  await assert.rejects(() => tools.get('launch_app').execute({ app: 'fixture.exe' }, exec), { code: 'turn_ended' });
  await assert.rejects(() => tools.get('activate_window').execute({ window }, exec), { code: 'turn_ended' });
  assert.deepEqual(calls, []);
});

test('DSH attachment resizing maps click, scroll and drag back to native pixels', async () => {
  const calls = [];
  const tools = new Map(buildTools(resolveConfig({ appConsent: 'never', approval: 'never' }), {
    states: new Map(),
    ctx: { get: () => ({ saveImage: async () => ({
      attachmentId: 'sha256:fixture', mediaType: 'image/png', bytes: 1, width: 500, height: 300,
    }) }) },
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'get_window') return { window };
      if (method === 'get_window_state') return { window, accessibility: null, screenshots: [
        { id: 'shot-1', width: 1000, height: 600, zIndex: 0, originX: 0, originY: 0, base64: 'AA==' },
      ] };
      return { ok: true };
    },
  }).map(tool => [tool.name, tool]));
  const state = await tools.get('get_window_state').execute({ window }, {});
  assert.equal(state.screenshots[0].width, 500);
  await tools.get('click').execute({ window, screenshotId: 'shot-1', x: 20, y: 30 }, {});
  await tools.get('scroll').execute({ window, x: 25, y: 35, scrollY: 1 }, {});
  await tools.get('drag').execute({ window, screenshotId: 'shot-1', from_x: 10, from_y: 20, to_x: 100, to_y: 120 }, {});
  const click = calls.find(call => call.method === 'click').params;
  const scroll = calls.find(call => call.method === 'scroll').params;
  const drag = calls.find(call => call.method === 'drag').params;
  assert.deepEqual([click.x, click.y], [40, 60]);
  assert.deepEqual([scroll.x, scroll.y, scroll.scrollY], [50, 70, 1]);
  assert.deepEqual([drag.from_x, drag.from_y, drag.to_x, drag.to_y], [20, 40, 200, 240]);
});

test('the provider slot is exclusive and startup rollback releases it after tools', async () => {
  let owner;
  const actions = [];
  const messages = [];
  const registry = {
    get providerName() { return owner; },
    register(name) {
      if (owner) throw new Error('slot occupied');
      owner = name;
      return () => { actions.push('slot'); owner = undefined; };
    },
  };
  const handlers = new Map();
  const mount = tools => ({ computerUse: registry, tools, logger: { warn: value => messages.push(value) },
    on: (event, handler) => { handlers.set(event, handler); } });
  let firstTool;
  const register = definition => { firstTool ??= definition; return () => actions.push('tool'); };
  apply(mount({ register }), { exposeMode: 'tools' });
  apply(mount({ register() { assert.fail('second provider installed a tool'); } }), { exposeMode: 'tools' });
  assert.match(messages[0], /slot already occupied by deepseek-computer-use/);
  const closing = handlers.get('dispose')();
  await assert.rejects(firstTool.execute({}, {}), { code: 'PROVIDER_SHUTTING_DOWN' });
  await closing;
  assert.deepEqual(actions, [...Array(17).fill('tool'), 'slot']);
  assert.equal(owner, undefined);
  actions.length = 0;
  let count = 0;
  await assert.rejects(apply(mount({ register() {
    if (++count > 1) throw new Error('registration failed');
    return () => actions.push('tool');
  } })), /registration failed/);
  assert.deepEqual(actions, ['tool', 'slot']);
});

test('helper environment removes Electron/Node overrides case-insensitively', () => {
  const result = buildCleanWin32Env({ NODE_OPTIONS: '--inspect', WINDIR: 'D:\\Windows' }, {
    Electron_Run_As_Node: '1', ELECTRON_NO_ATTACH_CONSOLE: '1', vscode_inspector_options: '{}',
    SystemRoot: 'D:\\Windows', Path: 'D:\\test',
  });
  assert.deepEqual(result, { Path: 'D:\\test', SystemRoot: 'D:\\Windows', WINDIR: 'D:\\Windows', COMSPEC: 'D:\\Windows\\System32\\cmd.exe' });
});

test('relative inputs require an observation and use 0..999 integer coordinates', async () => {
  const calls = [];
  const config = resolveConfig({ appConsent: 'never', approval: 'never' });
  const tools = new Map(buildTools(config, {
    ctx: {}, request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'get_window') return { window };
      if (method === 'get_window_state') return { window, accessibility: { elements: [] }, screenshots: [] };
      return {};
    },
  }).map(tool => [tool.name, tool]));
  const move = (x, y, options) => tools.get('mouse_move').execute({ window, x, y, relative: true, ...options }, {});
  await assert.rejects(move(500, 500), { code: 'SCREENSHOT_REQUIRED' });
  await tools.get('get_window_state').execute({ window, include_text: true, include_screenshot: false }, {});
  for (const [x, y] of [[-1, 5], [5, 1000], [6.25, 42]]) await assert.rejects(move(x, y), { code: 'invalid_arguments' });
  await assert.rejects(move(12, 42, { screenshotId: 'invalid' }), { code: 'invalid_arguments' });
  for (const n of [0, 500, 999]) await move(n, n);
  assert.deepEqual(calls.filter(call => call.method === 'mouse_move').map(({ params }) => [params.x, params.y, params.relative]),
    [[0, 0, true], [500, 500, true], [999, 999, true]]);
});

test('text-only Harness route rejects explicit screenshots and defaults to UIA', async () => {
  const calls = [];
  const agent = { session: { requestHeader: () => ({ config: { provider: 'fixture', model: 'text-only' } }) } };
  const [tool] = buildTools(resolveConfig({ appConsent: 'never' }), {
    ctx: { llm: { resolveModelInfo: async (provider, model) => {
      assert.equal(provider + '/' + model, 'fixture/text-only');
      return { inputModalities: ['text'] };
    } } },
    request: async (method, params) => {
      calls.push({ method, params });
      return method === 'get_window' ? { window } : { window, accessibility: { tree: 'fixture' }, screenshots: [] };
    },
  }).filter(tool => tool.name === 'get_window_state');
  await assert.rejects(tool.execute({ window, include_screenshot: true }, { agent }), { code: 'MODEL_DOES_NOT_SUPPORT_IMAGES' });
  assert.equal(calls.length, 0);
  const result = await tool.execute({ window }, { agent });
  assert.deepEqual([calls.at(-1).params.include_text, calls.at(-1).params.include_screenshot], [true, false]);
  assert.equal(result.accessibility.tree, 'fixture');
  assert.ok(result.notices.length);
});

test('profile grants persist, revocation invalidates old handles, and retry does not grant access', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-cu-grants-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = resolveConfig();
  let choice = 'Always allow';
  let prompts = 0;
  const ctx = { profileContext: { dir }, userQuestions: { ask: async request => {
    prompts++;
    assert.equal(request.questions[0].intent.kind, 'approval');
    return { answers: [{ id: 'computer-use-app', selected: [choice] }] };
  } } };
  const control = () => assert.fail('grant listing must not start the native helper');
  const access = createAccess(ctx, config, { control });
  const agent = { session: { id: 'fixture' } };
  const execution = { agent };
  const installed = installCua(ctx, { config, access, draining: () => false, releaseSession() {},
    execute: async (method, _args) => {
      if (method === 'list_apps') return { apps: [window.app] };
      if (method === 'list_windows') return { windows: [window] };
      return { accessibility: { tree: 'fixture' } };
    },
  });
  const cua = connectCua(() => args => installed.raw.execute(args, execution));
  const app = await cua.getApp(window.app.id);
  const handle = await app.getWindow(window.id);
  assert.equal((await handle.getAccessibilityTree()).tree, 'fixture');
  const reload = createAccess(ctx, config, { control });
  assert.equal((await reload.applications()).savedGrants[0].id, window.app.id);
  const binding = access.bind(window.app, execution);
  await access.revoke(window.app.id);
  assert.equal(binding.signal.reason.code, 'APP_ACCESS_REVOKED');
  binding.release();
  await assert.rejects(app.getWindows(), { code: 'APP_ACCESS_REVOKED' });
  await assert.rejects(handle.getAccessibilityTree(), { code: 'APP_ACCESS_REVOKED' });
  assert.deepEqual((await reload.applications()).savedGrants, []);
  choice = 'Refuse';
  await assert.rejects(cua.getApp(window.app.id), { code: 'approval_denied' });
  assert.equal((await reload.applications()).refusedApplications.length, 1);
  await assert.rejects(cua.getApp(window.app.id), { code: 'approval_denied' });
  assert.equal(prompts, 2);
  await access.retryApproval(window.app.id);
  assert.deepEqual((await access.applications()).refusedApplications, []);
  assert.deepEqual((await access.applications()).savedGrants, []);
  await installed.release(agent);
});

test('the two npm registry probes start concurrently and settle independently', async () => {
  const calls = [];
  const deferred = [Promise.withResolvers(), Promise.withResolvers()];
  const probe = probeRegistries(undefined, (url, options) => {
    assert.equal(options.cache, 'no-store');
    const index = calls.push(url) - 1;
    return deferred[index].promise;
  });
  assert.deepEqual(calls, [
    'https://registry.npmjs.org/deepseek-computer-use/latest',
    'https://registry.npmmirror.com/deepseek-computer-use/latest',
  ]);
  deferred[1].resolve(new Response(null, { status: 503 }));
  deferred[0].resolve(Response.json({ name: 'deepseek-computer-use', version: '0.3.1' }));
  const results = await probe;
  assert.equal(results[0].version, '0.3.1');
  assert.equal(results[1].error, 'registry-unavailable');
});
