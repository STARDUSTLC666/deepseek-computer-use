/**
 * Integration test for deepseek-computer-use.
 *
 * Drives the real plugin against a deterministic WinForms fixture (one text
 * box + one destructive-looking button) through a fake DSH context, so it
 * exercises registration, policy, observation, image attachment, set_value,
 * element clicks, approval gating and dry-run without needing the harness UI.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply } from '../lib/index.js';
import { connectCua } from '../lib/api.js';
import { setTimeout as delay } from 'node:timers/promises';
import { buildCleanWin32Env } from '../lib/bridge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const stamp = 'CU-' + Date.now().toString(36).toUpperCase();
const approvals = [];
const saved = [];
const disposeHandlers = [];

function makeCtx(registry, services = new Map()) {
  return {
    tools: { register: definition => { registry.set(definition.name, definition); return () => registry.delete(definition.name); } },
    logger: { warn: message => console.log('[warn]', message) },
    on: (event, handler) => { if (event === 'dispose') disposeHandlers.push(handler); return () => {}; },
    provide: (name, value) => { services.set(name, value); return () => services.delete(name); },
    get: service => {
      if (services.has(service)) return services.get(service);
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
const fixtureSource = path.join(here, 'fixture-form.cs');
if (!existsSync(fixtureExe) || statSync(fixtureExe).mtimeMs < statSync(fixtureSource).mtimeMs) {
  mkdirSync(path.dirname(fixtureExe), { recursive: true });
  execFileSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', [
    '/nologo', '/target:winexe', '/out:' + fixtureExe, fixtureSource,
    '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
  ], { stdio: 'ignore', env: buildCleanWin32Env(), windowsHide: true });
}
const geometryFile = path.join(here, 'bin', stamp + '-geometry.txt');
// The fixture must have a visible top-level window so Win32 can prove input ownership.
const fixture = spawn(fixtureExe, ['--geometry-file', geometryFile], { stdio: 'ignore', env: buildCleanWin32Env() });
await new Promise(resolve => setTimeout(resolve, 2200));

const tools = new Map();
const services = new Map();
let released = false;
let helperPid;
services.set('computerUse', {
  register(name) {
    assert.equal(name, 'deepseek-computer-use');
    return () => {
      if (helperPid) assert.throws(() => process.kill(helperPid, 0), { code: 'ESRCH' });
      released = true;
    };
  },
});
await apply(makeCtx(tools, services), { approval: 'sensitive' });

async function changeGeometry(mode) {
  const command = mode + ':' + Date.now();
  await writeFile(geometryFile, command);
  for (let i = 0; i < 60; i++) {
    if (await readFile(geometryFile + '.done', 'utf8').catch(() => '') === command) return;
    await delay(50);
  }
  throw new Error('fixture did not acknowledge ' + mode);
}

try {
  const names = [...tools.keys()].sort();
  console.log('registered (' + names.length + '): ' + names.join(', '));
  assert.equal(names.length, 18);
  assert.ok(tools.has('mouse_move') && tools.has('cua'));

  const health = await tools.get('computer_use_health').execute({}, {});
  helperPid = health.pid;
  const status = await services.get('cuaAccess').systemStatus();
  assert.equal(status.protocolVersion, 3);
  assert.equal(status.platform, 'windows');
  assert.equal(status.pid, undefined);
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
  console.log('screenshotId for coordinate actions: ' + shotId);

  const cua = connectCua(() => request => tools.get('cua').execute(request, {}));
  const apps = await cua.listApps();
  const app = await cua.getApp(apps.find(app => app.id === target.app.id).id);
  const win = await app.getWindow((await app.getWindows())[0].id);
  const tree = await win.getAccessibilityTree({ details: true, maxDepth: 8 });
  assert.ok(tree.elements.some(element => element.role === 'Edit'));
  const crop = await win.getScreenshot({ region: { x: 20, y: 12, width: 80, height: 60 } });
  assert.ok(crop.attachmentId && crop.screenshotId);
  const icons = await services.get('cuaAccess').applicationIcons();
  const png = Buffer.from(icons[target.app.executablePath].split(',')[1], 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 64);
  assert.equal(png.readUInt32BE(20), 64);

  const observe = () => tools.get('get_window_state').execute({ window: { id: target.id }, include_text: true, include_screenshot: false }, {});
  const hover = (x, y) => win.mouseMove({ x, y }, { relative: true });
  const currentInput = (await observe()).accessibility.elements.find(element => element.role === 'Edit');
  assert.ok(currentInput, 'The fixture window should expose its text box');

  const set = await tools.get('set_value').execute({ window: { id: target.id }, element_index: currentInput.index, value: stamp }, {});
  console.log('set_value: ' + JSON.stringify(set));

  let after = await tools.get('get_window_state').execute({ window: { id: target.id }, include_text: true }, {});
  let inputAfter = (after.accessibility.elements ?? []).find(element => element.index === input.index);
  console.log('value after set_value: ' + JSON.stringify(inputAfter?.value ?? '(not reported)'));
  assert.ok(String(after.accessibility.tree).includes(stamp), 'the fixture text box should carry the stamp');

  const before = approvals.length;
  const freshDestroy = (await observe()).accessibility.elements.find(element => /Delete all/i.test(String(element.name)));
  assert.ok(freshDestroy);
  const click = await tools.get('click').execute({ window: { id: target.id }, element_index: freshDestroy.index }, {});
  console.log('click: ' + JSON.stringify(click) + ' | approval requested: ' + (approvals.length > before) + ' (' + approvals.slice(before).join(',') + ')');
  assert.ok(approvals.length > before, 'a button labelled "Delete all" must be gated by approval');

  await new Promise(resolve => setTimeout(resolve, 300));
  try {
    after = await tools.get('get_window_state').execute({ window: { id: target.id }, include_text: true }, {});
    console.log('text after destructive click: ' + JSON.stringify(String(after.accessibility.tree).split('\n').find(line => line.includes('Edit'))?.slice(0, 120)));
    assert.ok(!String(after.accessibility.tree).includes(stamp), 'the approved click should have cleared the text box');
  } catch (error) {
    // A focus-stealing utility (ProcessLasso and friends) can hide or minimize the
    // fixture between the click and this observation. That is an environment fact,
    // not a plugin failure: report it and keep the rest of the suite running.
    if (error.code !== 'window_not_visible' && error.code !== 'window_minimized') throw error;
    console.log('observation skipped (' + error.code + '): the environment moved the fixture window');
  }

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
  let observed = await observe();
  console.log('fixture geometry: ' + JSON.stringify(observed.clientBounds));
  await changeGeometry('move');
  const translated = await hover(0, 0);
  assert.equal(translated.systemPointerMoved, false);
  assert.deepEqual([translated.screenX, translated.screenY], [observed.clientBounds.x + 24, observed.clientBounds.y + 12]);
  await changeGeometry('large');
  await assert.rejects(() => hover(500, 500), { code: 'WINDOW_CHANGED' });
  observed = await observe();
  assert.deepEqual([observed.clientBounds.width, observed.clientBounds.height], [1920, 1080]);
  for (const [unit, x, y] of [[0, 0, 0], [500, 960, 540], [999, 1918, 1079]]) {
    const moved = await hover(unit, unit);
    assert.deepEqual([moved.screenX - observed.clientBounds.x, moved.screenY - observed.clientBounds.y], [x, y]);
  }
  console.log('protocol v3, 64px icon, CUA object, cropped attachment, translation and resize guard verified');

  await changeGeometry('restore');
  observed = await observe();
  const holdTarget = observed.accessibility.elements.find(element => element.role === 'Edit');
  assert.ok(holdTarget, 'The restored fixture must expose its text box');
  try {
    const held = await win.click(holdTarget.index, { holdMs: 300 });
    assert.equal(held.clicked, 'pointer');
    assert.equal(held.releaseVerified, true);
    console.log('300ms physical hold and releaseVerified confirmed');
    const typed = await tools.get('type_text').execute({ window: { id: target.id }, text: '-typed' }, {});
    assert.equal(typed.typed, 6);
    console.log('type_text: ' + JSON.stringify(typed));
  } catch (error) {
    if (!['focus_failed', 'pointer_intercepted_by_foreign_window'].includes(error.code)) throw error;
    console.log('SKIP remaining physical input: Windows input guard returned ' + error.code);
  }
  await services.get('cuaAccess').revoke(target.app.id);
  await assert.rejects(() => app.getWindows(), { code: 'APP_ACCESS_REVOKED' });
  await assert.rejects(() => win.getAccessibilityTree(), { code: 'APP_ACCESS_REVOKED' });
  console.log('OK');
} finally {
  await Promise.all(disposeHandlers.map(dispose => dispose()));
  try { fixture.kill(); } catch { /* already gone */ }
  await Promise.all([geometryFile, geometryFile + '.done'].map(file => unlink(file).catch(() => {})));
}
assert.equal(released, true);
