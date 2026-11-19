import { buildCleanWin32Env } from '../lib/bridge.js';
import { ensurePrepared, BIN_DIR } from '../lib/build-helper.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const exe = (await ensurePrepared()).helperPath;
const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: buildCleanWin32Env({ DSH_CU_COMPONENT_DIR: BIN_DIR }) });
let buf = ''; const pending = new Map(); let seq = 0;
child.stdout.setEncoding('utf8');
child.stdout.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; const m = JSON.parse(line); const s = pending.get(m.id); if (!s) continue; pending.delete(m.id); m.ok ? s.resolve(m.result) : s.reject(Object.assign(new Error(m.error), { code: m.error })); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params: { ...params, __budgetMs: 8000 } }) + '\n'); });

const ov = await call('overlay_show', { ttlMs: 4000, text: 'esc test' });
console.log('overlay_show keys:', Object.keys(ov).join(','));
const cancelPath = ov.cancelFile ?? ov.cancel_file;
const wins = await call('list_windows', {});
writeFileSync(cancelPath, 'cancelled');
try { await call('click', { window: { id: wins.windows[0].id }, x: 5, y: 5 }); console.log('unexpected success'); }
catch (e) { console.log('click after Esc ->', e.code); }
const code = await new Promise(r => { if (child.exitCode !== null) return r(child.exitCode); const t = setTimeout(() => r('still-running'), 4000); child.on('exit', c => { clearTimeout(t); r(c); }); });
console.log('helper exit code:', code);
process.exit(0);
