import { apply } from '../lib/index.js';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const n of ['dsh-cu-fixture.exe', 'dsh-cu-overlay.exe']) {
  try { execFileSync('taskkill', ['/IM', n, '/F'], { stdio: 'ignore' }); } catch {}
}
const fixture = spawn(path.join(ROOT, 'test/bin/dsh-cu-fixture.exe'), [], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1700));

const registry = new Map();
let dispose = null;
apply({
  tools: { register: d => { registry.set(d.name, d); return () => {}; } },
  logger: { warn: m => console.log('[warn]', m) },
  on: (e, h) => { if (e === 'dispose') dispose = h; return () => {}; },
  get: s => s === 'approval' ? { request: async () => 'allowed-once' } : (s === 'attachments' ? { saveImage: async ({ name }) => ({ attachmentId: 'sha256:x', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name }) } : undefined),
}, { redactApps: ['dsh-cu-fixture'], appConsent: 'never' });

const wins = await registry.get('list_windows').execute({}, {});
const target = wins.windows.find(w => String(w.title).includes('DSH CU Test Form'));
const state = await registry.get('get_window_state').execute({ window: { id: target.id }, include_text: true, include_screenshot: true }, {});
console.log('redacted:', state.redacted, '| screenshots:', state.screenshots.length, '| note:', state.redactedNote);
console.log('elements still available:', state.accessibility.elementCount);

// the same call against a non-redacted app must still produce a screenshot
const chrome = wins.windows.find(w => /chrome/i.test(String(w.app?.name)));
if (chrome) {
  const s2 = await registry.get('get_window_state').execute({ window: { id: chrome.id }, include_text: false, include_screenshot: true }, {});
  console.log('chrome screenshots:', s2.screenshots.length, '| redacted:', s2.redacted ?? false, '| size:', s2.screenshots[0]?.width + 'x' + s2.screenshots[0]?.height);
}

try { dispose?.(); } catch {}
fixture.kill();
process.exit(0);
