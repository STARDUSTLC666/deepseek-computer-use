/** Real DSH CLI/profile + native fixture. No model calls or computer audio recording. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importFile = file => import(pathToFileURL(file).href);
export async function cleanupRunDirectory(home) {
  const parent = path.resolve(root, 'test', '.out');
  const absolute = path.resolve(home);
  assert.equal(path.dirname(absolute), parent, 'Cleanup must stay directly inside test/.out');
  assert.ok(path.basename(absolute).startsWith('harness-'), 'Only generated harness test directories can be removed');
  const remove = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) unlinkSync(file);
      else if (entry.isDirectory()) remove(file);
      else { chmodSync(file, 0o600); unlinkSync(file); }
    }
    rmdirSync(directory);
  };
  for (let attempt = 0; ; attempt++) {
    try { remove(absolute); return; }
    catch (error) {
      // A just-exited native capture can briefly retain its inherited cwd.
      if (attempt >= 29 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      await delay(100);
    }
  }
}
export const inject = ['tools', 'skills', 'attachments', 'approval', 'agents', 'appReady'];

export function apply(ctx, config) {
  ctx.effect(() => ctx.appReady.onReady(() => {
    void probe(ctx, config).then(
      result => writeFileSync(config.report, JSON.stringify({ ok: true, ...result })),
      error => writeFileSync(config.report, JSON.stringify({ ok: false, error: error.stack })),
    );
  }));
}

async function probe(ctx, config) {
  const require = createRequire(path.join(config.dshRoot, 'package.json'));
  const api = await importFile(require.resolve('@deepseek-ai/dsh-tools'));
  const schemas = ctx.tools.schemas().filter(tool => config.names.includes(tool.name));
  assert.equal(schemas.length, 16);
  for (const tool of schemas) api.assertObjectJsonSchema(tool.parameters);
  assert.ok((await ctx.skills.list()).some(skill => skill.name === 'computer-use-windows'));
  const handles = [];
  const approvals = [];
  const answerer = ctx.on('approval/request', async req => {
    assert.ok(config.names.includes(req.toolName), 'Only fixture plugin approvals are allowed');
    approvals.push(req);
    return 'allowed-once';
  });
  let seq = 0;
  const execute = (agent, name, args = {}, signal = AbortSignal.timeout(20_000)) => ctx.tools.execute({
    agent, name, arguments: args, callId: 'cu-harness-' + ++seq,
    signal,
  });
  const success = async (...args) => {
    const result = await execute(...args);
    assert.equal(result.isError, false, JSON.stringify(result.content));
    return result;
  };
  const openAgent = async suffix => {
    const handle = await ctx.agents.create({ sessionId: 'cu-harness-' + suffix + '-' + Date.now() });
    handles.push(handle);
    handle.agent.session.append('turn/start', { turn: 0 });
    return handle.agent;
  };
  try {
    const a = await openAgent('a');
    const health = (await success(a, 'computer_use_health')).value;
    assert.equal(health.platform, 'windows');
    const windows = (await success(a, 'list_windows')).value.windows;
    const window = windows.find(item => item.app?.pid === config.fixturePid);
    assert.ok(window, 'The owned native fixture must be visible');
    const params = { window, include_text: true, include_screenshot: true };
    const stateSchema = schemas.find(tool => tool.name === 'get_window_state').parameters;
    assert.deepEqual(api.validateJsonSchemaValue(stateSchema, params, ''), []);

    // The real ApprovalService must reject 'never' and persist that decision.
    ctx.approval.setPolicy(a, 'never');
    const denied = await execute(a, 'get_window_state', params);
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /did not approve/);
    assert.equal(approvals.length, 0);
    assert.ok(a.session.snapshotEvents().some(event => event.type === 'approval/decided' && event.data.outcome === 'rejected'));
    ctx.approval.setPolicy(a, 'ask');

    const observed = await success(a, 'get_window_state', params);
    assert.equal(approvals.length, 1);
    assert.ok(observed.content.some(part => part.type === 'image'), 'The model must receive an image block');
    const state = observed.value;
    const image = state.screenshots[0].attachment;
    assert.ok(image.attachmentId.startsWith('sha256:'));
    const stored = await ctx.attachments.readImage(image);
    assert.ok(stored.data.byteLength > 0, 'Screenshot bytes must be persisted in the real attachment store');
    const edit = state.accessibility.elements.find(element => element.role === 'Edit');
    assert.ok(edit);
    const text = 'DSH 宿主适配验证 ' + Date.now();
    await success(a, 'set_value', { window, element_index: edit.index, value: text });
    let after = (await success(a, 'get_window_state', params)).value;
    assert.ok(after.accessibility.tree.includes(text));
    const button = after.accessibility.elements.find(element => element.name === 'Delete all');
    assert.ok(button);
    await success(a, 'click', { window, element_index: button.index });
    assert.equal(approvals.length, 2, 'The fixture clear button needs its own approval');
    after = (await success(a, 'get_window_state', params)).value;
    assert.ok(!after.accessibility.tree.includes(text), 'The approved native action must change the fixture');

    const b = await openAgent('b');
    await success(b, 'get_window_state', params);
    assert.equal(approvals.length, 3, 'A second session must request its own app consent');
    // Return to A: B must not have invalidated A's helper snapshot.
    const nextText = text + ' session-a';
    const aEdit = after.accessibility.elements.find(element => element.role === 'Edit');
    await success(a, 'set_value', { window, element_index: aEdit.index, value: nextText });
    assert.equal(approvals.length, 3);
    after = (await success(a, 'get_window_state', params)).value;
    assert.ok(after.accessibility.tree.includes(nextText));

    // Failed native input cannot be repeated before a successful observation.
    const bad = await execute(a, 'click', { window, screenshotId: after.screenshots[0].id, x: -1, y: 1 });
    assert.equal(bad.isError, true);
    const retry = await execute(a, 'set_value', { window, element_index: aEdit.index, value: nextText });
    assert.equal(retry.isError, true);
    assert.match(JSON.stringify(retry.content), /get_window_state again/);
    after = (await success(a, 'get_window_state', params)).value;
    const freshEdit = after.accessibility.elements.find(element => element.role === 'Edit');
    await success(a, 'set_value', { window, element_index: freshEdit.index, value: '' });
    const focus = await execute(a, 'click', { window, element_index: freshEdit.index });
    let nativeCancellation = 'SKIP: fixture focus unavailable';
    if (!focus.isError) {
      const pid = (await success(a, 'computer_use_health')).value.pid;
      const controller = new AbortController();
      const typing = execute(a, 'type_text', { window, text: 'z'.repeat(100_000) }, controller.signal);
      let typed = 0;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try { typed = Number(readFileSync(config.progressFile, 'utf8')); } catch { }
        if (typed >= 32) break;
        await delay(20);
      }
      controller.abort();
      const cancelled = await typing;
      assert.equal(cancelled.isError, true);
      assert.ok(typed >= 32 && typed < 100_000, 'The native input must have actually started before abort');
      assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
      await delay(250);
      const stoppedAt = readFileSync(config.progressFile, 'utf8');
      await delay(200);
      assert.equal(readFileSync(config.progressFile, 'utf8'), stoppedAt, 'Native typing continued after cancellation');
      nativeCancellation = 'passed: partial native input stopped and helper exited';
      a.session.append('turn/end', { turn: 0, reason: { kind: 'completed' } });
      a.session.append('turn/start', { turn: 1 });
      const stale = await execute(a, 'click', { window, element_index: freshEdit.index });
      assert.equal(stale.isError, true);
      assert.match(JSON.stringify(stale.content), /get_window_state again/);
      after = (await success(a, 'get_window_state', params)).value;
      assert.notEqual((await success(a, 'computer_use_health')).value.pid, pid);
    }
    const bState = (await success(b, 'get_window_state', params)).value;
    const bEdit = bState.accessibility.elements.find(element => element.role === 'Edit');
    await success(b, 'set_value', { window, element_index: bEdit.index, value: 'turn-end-test' });
    const ending = (await success(b, 'computer_use_health')).value;
    const endingPid = ending.pid;
    assert.ok(Number.isInteger(ending.overlayPid), 'The indicator must be running before turn end');
    b.session.append('turn/end', { turn: 0, reason: { kind: 'completed' } });
    let proactiveStop = false;
    for (let i = 0; i < 100; i++) {
      try { process.kill(endingPid, 0); } catch (error) { if (error.code === 'ESRCH') { proactiveStop = true; break; } throw error; }
      await delay(20);
    }
    assert.ok(proactiveStop, 'The turn/end event must stop the helper without another tool call');
    for (let i = 0; i < 100; i++) {
      try { process.kill(ending.overlayPid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
      await delay(20);
    }
    assert.throws(() => process.kill(ending.overlayPid, 0), error => error.code === 'ESRCH', 'The turn/end event must stop the indicator');
    const ended = await execute(b, 'activate_window', { window });
    assert.equal(ended.isError, true);
    assert.match(JSON.stringify(ended.content), /turn.*ended/);
    a.session.append('turn/end', { turn: nativeCancellation.startsWith('SKIP') ? 0 : 1, reason: { kind: 'completed' } });
    return { toolCount: schemas.length, skillRegistered: true, approvalAudit: true,
      screenshotStored: true, imageRendered: true, nativeSetValue: true, nativeClick: true,
      sessionIsolation: true, turnEndBlocked: true, proactiveTurnStop: true, failedInputRecovery: true,
      nativeCancellation, audio: 'SKIP: no recording performed' };
  } finally {
    answerer();
    for (const handle of handles.reverse()) await handle.dispose();
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    'dsh-root': { type: 'string' },
    'plugin-root': { type: 'string' },
  } });
  assert.ok(values['dsh-root'], 'Pass --dsh-root <installed @deepseek-ai/dsh package directory>');
  assert.equal(process.platform, 'win32', 'Native host validation requires Windows');
  const dshRoot = path.resolve(values['dsh-root']);
  const pluginRoot = path.resolve(values['plugin-root'] ?? root);
  const manifest = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
  const dshVersion = JSON.parse(readFileSync(path.join(dshRoot, 'package.json'), 'utf8')).version;
  const validationRoot = path.join(root, 'test', '.out');
  mkdirSync(validationRoot, { recursive: true });
  const home = mkdtempSync(path.join(validationRoot, 'harness-'));
  const profile = path.join(home, 'profiles', 'cu-harness-test');
  const modules = path.join(profile, 'node_modules');
  const probeDir = path.join(home, 'probe');
  const report = path.join(home, 'report.json');
  mkdirSync(modules, { recursive: true });
  mkdirSync(probeDir);
  const links = [];
  const link = (name, target) => {
    const destination = path.join(modules, name);
    symlinkSync(target, destination, 'junction');
    links.push(destination);
  };
  let child;
  let fixture;
  let output = '';
  const stopped = child => new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), 7000);
    child.once('close', () => { clearTimeout(timer); resolve(true); });
  });
  try {
    const { buildTools, resolveConfig } = await importFile(path.join(pluginRoot, 'lib', 'index.js'));
    const { ensureHelper, ensureOverlay } = await importFile(path.join(pluginRoot, 'lib', 'build-helper.mjs'));
    ensureHelper();
    ensureOverlay();
    const fixtureExe = path.join(home, 'dsh-cu-fixture.exe');
    const progressFile = path.join(home, 'input-length.txt');
    {
      const { execFileSync } = await import('node:child_process');
      mkdirSync(path.dirname(fixtureExe), { recursive: true });
      execFileSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', [
        '/nologo', '/target:winexe', '/out:' + fixtureExe, path.join(root, 'test', 'fixture-form.cs'),
        '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
      ], { windowsHide: true });
    }
    fixture = spawn(fixtureExe, ['--progress-file', progressFile], { stdio: 'ignore' });
    await delay(1800);
    writeFileSync(path.join(probeDir, 'package.json'), JSON.stringify({ name: 'dsh-cu-harness-probe', type: 'module', main: 'index.mjs' }));
    writeFileSync(path.join(probeDir, 'index.mjs'), 'export { apply, inject } from ' + JSON.stringify(import.meta.url) + ';\n');
    link(manifest.name, pluginRoot);
    link('dsh-cu-harness-probe', probeDir);
    writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ private: true,
      dependencies: { [manifest.name]: 'link:' + pluginRoot, 'dsh-cu-harness-probe': 'link:' + probeDir },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', manifest.name] } },
    }));
    const names = buildTools(resolveConfig(), {}).map(tool => tool.name);
    writeFileSync(path.join(profile, 'cordis.patch.yml'), JSON.stringify([{ insert: [{
      id: 'cu-harness-probe', name: 'dsh-cu-harness-probe',
      config: { dshRoot, report, fixturePid: fixture.pid, progressFile, names },
    }] }]));
    const allowed = /^(?:path|pathext|systemroot|windir|comspec|temp|tmp|appdata|localappdata|userprofile|home|homedrive|homepath|programfiles(?:\(x86\))?|programdata|os|processor_architecture)$/i;
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key)));
    Object.assign(env, { DSH_HOME: home, DSH_AGENTS_HOME: path.join(home, '.agents'), DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' });
    child = spawn(process.execPath, [path.join(dshRoot, 'lib', 'bin.js'), '--profile', 'cu-harness-test'], {
      cwd: home, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => { output += error.message; });
    const deadline = Date.now() + 60_000;
    while (!existsSync(report) && Date.now() < deadline && child.exitCode === null) await delay(150);
    assert.ok(existsSync(report), 'DSH probe did not finish: ' + output.slice(-5000));
    const result = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(result.ok, true, result.error ?? output.slice(-5000));
    console.log(JSON.stringify({ dshVersion, pluginVersion: manifest.version, pluginRoot, ...result }, null, 2));
  } finally {
    // Only terminate processes created by this test, never by executable name.
    child?.kill();
    if (!await stopped(child)) { child.kill('SIGKILL'); assert.ok(await stopped(child), 'DSH process did not stop'); }
    fixture?.kill();
    assert.ok(await stopped(fixture), 'Fixture process did not stop');
    for (const destination of links) unlinkSync(destination);
    // DSH stores immutable attachments; remove only our generated files and
    // empty directories, never recurse through junctions or remove a parent.
    await cleanupRunDirectory(home);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
