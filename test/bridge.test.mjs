import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { HelperBridge } from '../lib/bridge.js';
import { cleanupRunDirectory } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
async function fixture(run) {
  const parent = path.join(here, '.out');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, 'harness-bridge-'));
  const bridge = new HelperBridge({ exe: process.execPath, args: [path.join(here, 'fixtures', 'rpc-helper.mjs')], cancelDirectory: path.join(directory, 'requests') });
  try { await run(bridge, path.join(directory, 'effects.txt')); }
  finally { await bridge.dispose(); await cleanupRunDirectory(directory); }
}
function exited(pid) {
  assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH', 'the owned helper must exit before cancellation settles');
}
async function hasEffects(file) {
  for (let i = 0; i < 200; i++) { if (existsSync(file)) return; await delay(10); }
  assert.fail('fixture never started its side effects');
}

for (const ignoreCancel of [false, true]) {
  test('timeout stops ' + (ignoreCancel ? 'unresponsive' : 'cooperative') + ' helper before reporting failure', async () => fixture(async (bridge, effectFile) => {
    const first = await bridge.request('ping');
    await assert.rejects(() => bridge.request('slow', { effectFile, ignoreCancel }, { timeoutMs: 100 }), { code: 'timeout' });
    exited(first.pid);
    const count = readFileSync(effectFile, 'utf8');
    await delay(80);
    assert.equal(readFileSync(effectFile, 'utf8'), count);
    assert.notEqual((await bridge.request('ping')).pid, first.pid);
  }));
}

test('abort stops active input, blocks that turn, and permits a fresh turn', async () => fixture(async (bridge, effectFile) => {
  const first = await bridge.request('ping', {}, { turnToken: 'a' });
  const controller = new AbortController();
  const slow = bridge.request('slow', { effectFile }, { signal: controller.signal, turnToken: 'a' });
  const rejected = assert.rejects(slow, { code: 'cancelled' });
  await hasEffects(effectFile);
  controller.abort();
  await rejected;
  exited(first.pid);
  await assert.rejects(() => bridge.request('ping', {}, { turnToken: 'a' }), { code: 'turn_stopped' });
  assert.notEqual((await bridge.request('ping', {}, { turnToken: 'b' })).pid, first.pid);
}));

test('physical Escape exit remains blocked for the rest of its turn', async () => fixture(async bridge => {
  await bridge.request('ping', {}, { turnToken: 'a' });
  await assert.rejects(() => bridge.request('escape_exit', {}, { turnToken: 'a' }), { code: 'cancelled_by_user' });
  await assert.rejects(() => bridge.request('ping', {}, { turnToken: 'a' }), { code: 'turn_stopped' });
  assert.ok((await bridge.request('ping', {}, { turnToken: 'b' })).pid > 0);
}));

test('turn end proactively stops an idle helper without another tool call', async () => fixture(async bridge => {
  const first = await bridge.request('ping', {}, { turnToken: 'a' });
  await bridge.stopTurn('a');
  exited(first.pid);
  await assert.rejects(() => bridge.request('ping', {}, { turnToken: 'a' }), { code: 'turn_ended' });
  assert.notEqual((await bridge.request('ping', {}, { turnToken: 'b' })).pid, first.pid);
}));

test('turn end stops active work and blocks queued input from the ended turn', async () => fixture(async (bridge, effectFile) => {
  const first = await bridge.request('ping', {}, { turnToken: 'a' });
  const slow = assert.rejects(bridge.request('slow', { effectFile }, { turnToken: 'a' }), { code: 'turn_ended' });
  const queued = assert.rejects(bridge.request('ping', {}, { turnToken: 'a' }), { code: 'turn_ended' });
  await hasEffects(effectFile);
  await bridge.stopTurn('a');
  await Promise.all([slow, queued]);
  exited(first.pid);
  assert.notEqual((await bridge.request('ping', {}, { turnToken: 'b' })).pid, first.pid);
}));

for (const method of ['invalid', 'fragment_exit']) {
  test(method + ' cannot contaminate a replacement helper stream', async () => fixture(async bridge => {
    const first = await bridge.request('ping');
    await assert.rejects(() => bridge.request(method), { code: method === 'invalid' ? 'protocol_error' : 'helper_exited' });
    exited(first.pid);
    assert.notEqual((await bridge.request('ping')).pid, first.pid);
  }));
}

test('dispose stops active work and prevents a queued call from starting another process', async () => fixture(async (bridge, effectFile) => {
  const first = await bridge.request('ping');
  const slow = bridge.request('slow', { effectFile });
  const rejected = assert.rejects(slow, { code: 'disposed' });
  const queued = assert.rejects(bridge.request('ping'), { code: 'disposed' });
  await hasEffects(effectFile);
  await bridge.dispose();
  await Promise.all([rejected, queued]);
  exited(first.pid);
}));
