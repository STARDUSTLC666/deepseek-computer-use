import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTools, resolveConfig } from '../lib/index.js';
import { requestApproval } from '../lib/safety.js';

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
  assert.equal(tools.size, 16);
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
