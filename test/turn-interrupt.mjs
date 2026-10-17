import { HelperBridge } from '../lib/bridge.js';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try { execFileSync('taskkill', ['/IM', 'dsh-cu-fixture.exe', '/F'], { stdio: 'ignore' }); } catch {}
try { execFileSync('taskkill', ['/IM', 'dsh-cu-overlay.exe', '/F'], { stdio: 'ignore' }); } catch {}
const fixture = spawn(path.join(ROOT, 'test/bin/dsh-cu-fixture.exe'), [], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1800));

const bridge = new HelperBridge({ exe: path.join(ROOT, 'native/bin/dsh-computer-use-helper.exe'), timeoutMs: 20000 });
const wins = await bridge.request('list_windows', {}, { turnToken: 'turn-A' });
const target = wins.windows.find(w => String(w.title).includes('DSH CU Test Form'));
console.log('fixture:', target.id);

const state = await bridge.request('get_window_state', { window: { id: target.id }, include_text: true }, { turnToken: 'turn-A' });
const edit = (state.accessibility?.elements ?? []).find(e => e.role === 'Edit');
console.log('edit index:', edit?.index);

const click = () => bridge.request('click', { window: { id: target.id }, element_index: edit.index }, { turnToken: 'turn-A' });
const c1 = await click();
console.log('1) click with token A:', JSON.stringify(c1), '(overlay should be up)');

execFileSync('powershell', ['-NoProfile', '-Command', "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport(\"user32.dll\")]public static extern void keybd_event(byte vk,byte s,uint f,System.UIntPtr e);}'; [K]::keybd_event(0x1B,0,0,[System.UIntPtr]::Zero); [K]::keybd_event(0x1B,0,2,[System.UIntPtr]::Zero)"], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
console.log('2) pressed Esc');

for (const [label, token] of [['3) same token A again', 'turn-A'], ['4) same token A a third time', 'turn-A'], ['5) new token B', 'turn-B']]) {
  try {
    const res = await bridge.request('click', { window: { id: target.id }, element_index: edit.index }, { turnToken: token });
    console.log(label + ' -> allowed', JSON.stringify(res));
  } catch (error) {
    console.log(label + ' -> ' + error.code + ': ' + String(error.message).slice(0, 90));
  }
}

bridge.dispose();
fixture.kill();
process.exit(0);
