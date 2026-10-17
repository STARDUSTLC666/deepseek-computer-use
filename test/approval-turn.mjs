import { HelperBridge } from '../lib/bridge.js';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['dsh-cu-fixture.exe', 'dsh-cu-overlay.exe']) {
  try { execFileSync('taskkill', ['/IM', name, '/F'], { stdio: 'ignore' }); } catch {}
}
const fixture = spawn(path.join(ROOT, 'test/bin/dsh-cu-fixture.exe'), [], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1800));

const bridge = new HelperBridge({ exe: path.join(ROOT, 'native/bin/dsh-computer-use-helper.exe'), timeoutMs: 20000 });
const token = 'turn-x';

const cfg = await bridge.request('configure', { requireAppApproval: true }, { turnToken: token });
console.log('1) configure ->', JSON.stringify(cfg));

const wins = await bridge.request('list_windows', {}, { turnToken: token });
const target = wins.windows.find(w => String(w.title).includes('DSH CU Test Form'));
const appId = target.app.id;
console.log('   fixture app id =', appId);

try {
  await bridge.request('get_window_state', { window: { id: target.id }, include_text: true }, { turnToken: token });
  console.log('2) observe before approval -> ALLOWED (unexpected)');
} catch (error) {
  console.log('2) observe before approval ->', error.code);
}

const approved = await bridge.request('approve_app', { app: appId }, { turnToken: token });
console.log('3) approve_app ->', JSON.stringify(approved));

const state = await bridge.request('get_window_state', { window: { id: target.id }, include_text: true }, { turnToken: token });
const edit = (state.accessibility?.elements ?? []).find(e => e.role === 'Edit');
console.log('4) observe after approval -> ok, elements =', state.accessibility.elementCount);

const clicked = await bridge.request('click', { window: { id: target.id }, element_index: edit.index }, { turnToken: token });
console.log('5) click ->', JSON.stringify(clicked));

const ended = await bridge.request('end_turn', {}, { turnToken: token });
console.log('6) end_turn ->', JSON.stringify(ended));

try {
  await bridge.request('click', { window: { id: target.id }, element_index: edit.index }, { turnToken: token });
  console.log('7) stale index after end_turn -> ALLOWED (bad)');
} catch (error) {
  console.log('7) stale index after end_turn ->', error.code);
}

const again = await bridge.request('get_window_state', { window: { id: target.id }, include_text: true }, { turnToken: token });
console.log('8) approvals survive end_turn -> observe ok, elements =', again.accessibility.elementCount);

bridge.dispose();
fixture.kill();
process.exit(0);
