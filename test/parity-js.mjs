import { apply } from '../lib/index.js';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const n of ['dsh-cu-fixture.exe', 'dsh-cu-overlay.exe']) { try { execFileSync('taskkill', ['/IM', n, '/F'], { stdio: 'ignore' }); } catch {} }
const fixture = spawn(path.join(ROOT, 'test/bin/dsh-cu-fixture.exe'), [], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1700));

const registry = new Map();
let dispose = null;
const approvals = [];
apply({
  tools: { register: d => { registry.set(d.name, d); return () => {}; } },
  logger: { warn: m => console.log('[warn]', m) },
  on: (e, h) => { if (e === 'dispose') dispose = h; return () => {}; },
  get: s => s === 'approval'
    ? { effectivePolicy: () => 'on-request', request: async req => { approvals.push(req.reason ?? req.toolName); return 'allowed-once'; } }
    : (s === 'attachments' ? { saveImage: async ({ name }) => ({ attachmentId: 'sha256:x', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name }) } : undefined),
}, { appConsent: 'session', audio: true });

const wins = await registry.get('list_windows').execute({}, {});
const target = wins.windows.find(w => String(w.title).includes('DSH CU Test Form'));
const state = await registry.get('get_window_state').execute({ window: { id: target.id }, include_text: true, include_screenshot: true }, {});
const shot = state.screenshots[0];
console.log('shot:', shot.id, shot.width + 'x' + shot.height);

// 1) coordinate outside the screenshot bounds
try { await registry.get('click').execute({ window: { id: target.id }, x: 99999, y: 10, screenshotId: shot.id }, {}); console.log('bounds: NOT ENFORCED'); }
catch (e) { console.log('bounds ->', e.code ?? e.message.slice(0, 60), '|', String(e.message).slice(0, 90)); }

// 2) unknown screenshotId
try { await registry.get('click').execute({ window: { id: target.id }, x: 10, y: 10, screenshotId: 'shot-999-1' }, {}); console.log('stale: NOT ENFORCED'); }
catch (e) { console.log('stale ->', e.code ?? '', '|', String(e.message).slice(0, 110)); }

// 3) approvals recorded so far (per-app consent)
console.log('approvals after observe+clicks:', JSON.stringify(approvals));

// 4) audio: separate "computer-audio" approval, then a real recording
const started = await registry.get('start_audio_recording').execute({ max_duration_ms: 1200 }, {});
console.log('audio approval asked:', approvals.some(a => String(a).includes('record computer audio')));
await new Promise(r => setTimeout(r, 900));
const stopped = await registry.get('stop_audio_recording').execute({}, {});
const wav = Buffer.from(stopped.bytes, 'base64');
console.log('audio:', JSON.stringify({ bytes: wav.length, rate: wav.readUInt32LE(24), ch: wav.readUInt16LE(22), dataUrl: stopped.data_url.slice(0, 16) }));

try { dispose?.(); } catch {}
fixture.kill();
process.exit(0);
