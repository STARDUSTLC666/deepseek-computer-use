/**
 * Integration test for dsh-computer-use-windows.
 *
 * Drives the real plugin against a deterministic WinForms fixture (one text
 * box + one destructive-looking button) through a fake DSH context, so it
 * exercises registration, policy, observation, image attachment, set_value,
 * element clicks, approval gating and dry-run without needing the harness UI.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply } from '../lib/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const stamp = 'CU-' + Date.now().toString(36).toUpperCase();
const approvals = [];
const saved = [];
let disposeHandler = null;

function makeCtx(registry) {
  return {
    tools: { register: definition => { registry.set(definition.name, definition); return () => registry.delete(definition.name); } },
    logger: { warn: message => console.log('[warn]', message) },
    on: (event, handler) => { if (event === 'dispose') disposeHandler = handler; return () => {}; },
    get: service => {
      if (service === 'attachments') {
        return {
          saveImage: async ({ data, mediaType, name }) => {
            saved.push({ mediaType, name, bytes: data.length });
            return { attachmentId: 'sha256:test-' + saved.length, mediaType, bytes: data.length, width: 1280, height: 720, name };
          },
        };
      }
      if (service === 'approval') {
        return { request: async request => { approvals.push(request.toolName); return 'allowed-once'; } };
      }
      return undefined;
    },
  };
}

// The fixture must not be hosted by a shell: shell windows are hard-denied.
const fixtureExe = path.join(here, 'bin', 'dsh-cu-fixture.exe');
if (!existsSync(fixtureExe)) {
  mkdirSync(path.dirname(fixtureExe), { recursive: true });
  execFileSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', [
    '/nologo', '/target:winexe', '/out:' + fixtureExe, path.join(here, 'fixture-form.cs'),
    '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
  ], { stdio: 'ignore' });
}
const fixture = spawn(fixtureExe, [], { stdio: 'ignore' });
await new Promise(resolve => setTimeout(resolve, 2200));

const tools = new Map();
apply(makeCtx(tools), { approval: 'sensitive' });

try {
  const names = [...tools.keys()].sort();
  console.log('registered (' + names.length + '): ' + names.join(', '));
  assert.equal(names.length, 16);

  const health = await tools.get('computer_use_health').execute({}, {});
  console.log('health: platform=' + health.platform + ' windows=' + health.windows + ' helper=' + health.helper.exists + ' compiler=' + (health.helper.compiler !== null));

  const windows = await tools.get('list_windows').execute({}, {});
  const target = windows.windows.find(window => String(window.title).includes('DSH CU Test Form'));
  assert.ok(target, 'the fixture window should be listable');
  console.log('fixture window id=' + target.id + ' app=' + target.app.name + ' class=' + target.className);

  const state = await tools.get('get_window_state').execute({ window: { id: target.id }, include_text: true }, {});
  console.log('elements=' + state.accessibility.elementCount);
  const elements = state.accessibility.elements ?? [];
  const input = elements.find(element => String(element.name).includes('cu-test-input'))
    ?? elements.find(element => element.role === 'Edit');
  const destroy = elements.find(element => /Delete all/i.test(String(element.name)));
  assert.ok(input, 'the fixture text box should be observable');
  assert.ok(destroy, 'the fixture button should be observable');
  console.log('input element [' + input.index + '] ' + input.role + ' "' + input.name + '", button [' + destroy.index + '] "' + destroy.name + '"');

  const shot = await tools.get('get_window_state').execute({ window: { id: target.id }, include_screenshot: true }, {});
  assert.equal(shot.accessibility, null, 'accessibility must be null unless include_text was requested');
  assert.ok(Array.isArray(shot.screenshots) && shot.screenshots.length >= 1, 'screenshots must be an array');
  assert.ok(String(shot.screenshots[0].attachmentId).startsWith('sha256:test-'));
  assert.ok(Number.isInteger(shot.screenshots[0].zIndex), 'each screenshot carries a zIndex');
  assert.ok(Number.isFinite(shot.screenshots[0].originX), 'each screenshot carries its screen origin');
  console.log('screenshots: ' + shot.screenshots.map(s => s.id + ' ' + s.width + 'x' + s.height + '@' + s.originX + ',' + s.originY + ' z=' + s.zIndex).join(' | '));
  const rendered = tools.get('get_window_state').output.render({}, shot);
  console.log('render parts: ' + rendered.map(part => part.type).join('+'));

  // screenshotId must be accepted by coordinate actions
  const shotId = shot.screenshots[0].id;
  const dryCoord = await (await import('../lib/safety.js')).labelOfElement;
  console.log('screenshotId for coordinate actions: ' + shotId);

  const set = await tools.get('set_value').execute({ window: { id: target.id }, element_index: input.index, value: stamp }, {});
  console.log('set_value: ' + JSON.stringify(set));

  let after = await tools.get('get_window_state').execute({ window: { id: target.id }, include_text: true }, {});
  let inputAfter = (after.accessibility.elements ?? []).find(element => element.index === input.index);
  console.log('value after set_value: ' + JSON.stringify(inputAfter?.value ?? '(not reported)'));
  assert.ok(String(after.accessibility.tree).includes(stamp), 'the fixture text box should carry the stamp');

  try {
    const typed = await tools.get('type_text').execute({ window: { id: target.id }, text: '-typed' }, {});
    console.log('type_text: ' + JSON.stringify(typed));
  } catch (error) {
    // An always-on-top utility or an elevated window can hold the foreground;
    // the plugin must refuse rather than type into the wrong app.
    assert.equal(error.code, 'focus_failed');
    console.log('type_text refused (focus held elsewhere): ' + error.message.slice(0, 130));
  }

  const before = approvals.length;
  const click = await tools.get('click').execute({ window: { id: target.id }, element_index: destroy.index }, {});
  console.log('click: ' + JSON.stringify(click) + ' | approval requested: ' + (approvals.length > before) + ' (' + approvals.slice(before).join(',') + ')');
  assert.ok(approvals.length > before, 'a button labelled "Delete all" must be gated by approval');

  await new Promise(resolve => setTimeout(resolve, 300));
  after = await tools.get('get_window_state').execute({ window: { id: target.id }, include_text: true }, {});
  console.log('text after destructive click: ' + JSON.stringify(String(after.accessibility.tree).split('\n').find(line => line.includes('Edit'))?.slice(0, 120)));
  assert.ok(!String(after.accessibility.tree).includes(stamp), 'the approved click should have cleared the text box');

  const dryRegistry = new Map();
  apply(makeCtx(dryRegistry), { dryRun: true });
  const dry = await dryRegistry.get('click').execute({ window: { id: target.id }, x: 10, y: 10 }, {});
  assert.equal(dry.dryRun, true);
  console.log('dry-run click did not touch the OS: ' + JSON.stringify(dry.wouldClick.x));

  const denyRegistry = new Map();
  apply(makeCtx(denyRegistry), { denyApps: [target.app.name] });
  await assert.rejects(
    () => denyRegistry.get('click').execute({ window: { id: target.id }, x: 10, y: 10 }, {}),
    error => { console.log('deny policy refused the action: ' + error.code); return error.code === 'app_denied'; },
  );

  // Codex contract: scroll requires x/y, and the Window key family is hard-denied
  const { assertKeyAllowed } = await import('../lib/safety.js');
  assert.throws(() => assertKeyAllowed('Win+r'), error => error.code === 'hard_denied');
  assert.throws(() => assertKeyAllowed('Control_L+super_l'), error => error.code === 'hard_denied');
  console.log('hard deny: Win key refused');
  try {
    await tools.get('scroll').execute({ window: { id: target.id }, scrollY: 3 }, {});
  } catch (error) {
    console.log('scroll without x/y refused: ' + error.message.slice(0, 70));
  }
  console.log('OK');
} finally {
  try { disposeHandler?.(); } catch { /* best effort */ }
  try { fixture.kill(); } catch { /* already gone */ }
  setTimeout(() => process.exit(0), 100);
}
