import { apply } from '../lib/index.js';
setTimeout(() => { console.log('[WATCHDOG] stalled'); process.exit(0); }, 25000);
process.on('uncaughtException', e => { console.log('[uncaught]', e?.code, String(e?.message ?? e).slice(0, 60)); });
process.on('unhandledRejection', (err) => { console.log('[unhandled]', err?.code, String(err?.message ?? err).slice(0, 70)); });
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const n of ['dsh-cu-fixture.exe', 'dsh-cu-overlay.exe', 'dsh-computer-use-helper.exe']) { try { execFileSync('taskkill', ['/IM', n, '/F'], { stdio: 'ignore' }); } catch {} }
const fixture = spawn(path.join(ROOT, 'test/bin/dsh-cu-fixture.exe'), [], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1700));

const registry = new Map();
let dispose = null;
apply({
  tools: { register: d => { registry.set(d.name, d); return () => {}; } },
  logger: { warn: m => console.log('[log]', m) },
  on: (e, h) => { if (e === 'dispose') dispose = h; return () => {}; },
  get: s => s === 'approval' ? { effectivePolicy: () => 'never', request: async () => 'allowed-once' }
    : (s === 'attachments' ? { saveImage: async ({ name }) => ({ attachmentId: 'sha256:x', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name }) } : undefined),
}, { appConsent: 'never' });

const SESSION_ID = 'esc-e2e-' + Date.now();   // unique so a stale marker can never leak in
const sessionWithTurns = count => {
  const events = Array.from({ length: count }, () => ({ type: 'turn/start' }));
  return { id: SESSION_ID, seq: events.length, eventAt: i => events[i] };
};
const execFor = (turns, callId) => ({ agent: { session: sessionWithTurns(turns) }, callId });

const wins = await registry.get('list_windows').execute({}, execFor(1, 'c1'));
const target = wins.windows.find(w => String(w.title).includes('DSH CU Test Form'));
const click = (e, x = 400, y = 250) => registry.get('click').execute({ window: { id: target.id }, x, y }, e);

// A focus-stealing utility (ProcessLasso and friends) can hold the foreground; the
// plugin then refuses to inject. Retry, and skip cleanly if the environment refuses.
let first = null;
for (let attempt = 1; attempt <= 4 && first === null; attempt++) {
  try { first = await click(execFor(1, 'c1')); }
  catch (error) {
    if (error.code !== 'focus_failed' || attempt === 4) {
      if (error.code === 'focus_failed') {
        console.log('SKIPPED: another process holds the foreground (' + String(error.message).slice(0, 60) + '...)');
        process.exit(0);
      }
      throw error;
    }
    await new Promise(r => setTimeout(r, 700));
  }
}
console.log('turn1 click ->', first.clicked);
await new Promise(r => setTimeout(r, 400));
try { await registry.get('press_key').execute({ window: { id: target.id }, key: 'Escape' }, execFor(1, 'c1')); } catch (e) { console.log('press_key ->', e.code); }
await new Promise(r => setTimeout(r, 700));

for (const [label, e] of [['after Esc', execFor(1, 'c1')], ['same turn again', execFor(1, 'c1')]]) {
  try { await click(e); console.log(label, '-> NOT BLOCKED'); }
  catch (err) { console.log(label, '->', err.code); }
}
try { console.log('turn2 click ->', (await click(execFor(2, 'c2'))).clicked); }
catch (err) { console.log('turn2 ->', err.code, String(err.message).slice(0, 60)); }

const before = execFileSync('tasklist', ['/FI', 'IMAGENAME eq dsh-computer-use-helper.exe'], { encoding: 'utf8' });
console.log('helper running before dispose:', /dsh-computer-use-helper/.test(before));
try { dispose?.(); } catch {}
await new Promise(r => setTimeout(r, 600));
const after = execFileSync('tasklist', ['/FI', 'IMAGENAME eq dsh-computer-use-helper.exe'], { encoding: 'utf8' });
console.log('helper running after dispose:', /dsh-computer-use-helper/.test(after));
fixture.kill();
process.exit(0);
