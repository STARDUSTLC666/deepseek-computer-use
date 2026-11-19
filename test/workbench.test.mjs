import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbench } from '../lib/workbench.js';

const headers = { 'x-deepseek-computer-use': '1', 'content-type': 'application/json' };
function fixture() {
  let calls = 0;
  const workbench = createWorkbench({}, {}, {
    access: { async applications() { calls++; return []; }, ptcConfiguration() { return {}; } },
    draining: () => false,
  });
  return { workbench, calls: () => calls };
}
function post(body) {
  return new Request('http://localhost/api/deepseek-computer-use/workbench', { method: 'POST', headers, body, duplex: 'half' });
}

test('workbench handles valid text and enforces the byte limit before dispatch', async () => {
  const f = fixture();
  const exact = JSON.stringify({ action: 'state' }).padEnd(16384);
  assert.equal((await f.workbench.fetch(post(exact))).status, 200);
  assert.equal((await f.workbench.fetch(post(exact + ' '))).status, 413);
  assert.equal((await f.workbench.fetch(post(JSON.stringify({ action: 'state', comment: '文'.repeat(5500) })))).status, 413);
  assert.equal(f.calls(), 1);
});

test('oversized streams are cancelled without dispatch', async () => {
  const f = fixture();
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(16385)); },
    cancel() { cancelled = true; },
  });
  const response = await f.workbench.fetch(post(body));
  assert.equal(response.status, 413);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(cancelled, true);
  assert.equal(f.calls(), 0);
});
