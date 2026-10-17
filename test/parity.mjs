import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const exe = path.join(ROOT, 'native/bin/dsh-computer-use-helper.exe');
const timeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);

function session() {
  const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let buf = ''; const pending = new Map(); let seq = 0;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line); const slot = pending.get(msg.id);
      if (!slot) continue; pending.delete(msg.id);
      msg.ok ? slot.resolve(msg.result) : slot.reject(Object.assign(new Error(msg.error), { code: msg.error }));
    }
  });
  const call = (method, params = {}, budget = 8000) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params: { ...params, __budgetMs: budget } }) + '\n');
  });
  return { child, call };
}
const exitOf = (child, ms = 4000) => new Promise(r => {
  if (child.exitCode !== null) return r(child.exitCode);
  const t = setTimeout(() => r('still-running'), ms);
  child.on('exit', c => { clearTimeout(t); r(c); });
});

const s = session();
console.log('hello:', JSON.stringify(await timeout(s.call('hello', {}), 5000, 'hello').then(h => ({ v: h.protocolVersion, caps: h.capabilities.length }))));
console.log('close:', JSON.stringify(await timeout(s.call('close', {}), 3000, 'close')));
console.log('exit code after close:', await exitOf(s.child));

const s3 = session();
const started = await timeout(s3.call('start_audio_recording', { maxDurationMs: 2500, approvedApp: 'computer-audio' }), 6000, 'audio-start');
console.log('audio start ok:', typeof started.filepath === 'string');
await new Promise(r => setTimeout(r, 1500));
const stopped = await timeout(s3.call('stop_audio_recording', {}), 12000, 'audio-stop');
const wav = Buffer.from(stopped.bytes, 'base64');
console.log('audio stop:', JSON.stringify({ bytes: wav.length, sampleRate: wav.readUInt32LE(24), channels: wav.readUInt16LE(22), bits: wav.readUInt16LE(34), dataUrl: stopped.data_url.slice(0, 22) }));
s3.child.kill();

const s4 = session();
const wins = await timeout(s4.call('list_windows', {}, 1), 6000, 'budget-list');
console.log('budgeted list_windows:', wins.count);
const hello4 = await timeout(s4.call('hello', {}), 3000, 'hello4');
console.log('protocol after budget:', hello4.protocolVersion);
s4.child.kill();
process.exit(0);
