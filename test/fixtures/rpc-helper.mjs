/** Deterministic serial helper for timeout/cancel/crash tests; never operates the desktop. */
import fs from 'node:fs';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
let queue = Promise.resolve();
const lines = createInterface({ input: process.stdin });
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
lines.on('line', line => {
  queue = queue.then(async () => {
    const { id, method, params } = JSON.parse(line);
    if (method === 'close') process.exit(0);
    if (method === 'hello') return send({ id, ok: true, result: { protocolVersion: 2 } });
    if (method === 'invalid') return process.stdout.write('not-json\n');
    if (method === 'escape_exit') process.exit(130);
    if (method === 'fragment_exit') { process.stdout.write('{"id":'); process.exit(5); }
    if (method === 'slow') {
      const until = Date.now() + 3000;
      let effects = 0;
      while (Date.now() < until) {
        if (!params.ignoreCancel && fs.existsSync(params.__cancelFile)) break;
        fs.writeFileSync(params.effectFile, String(++effects));
        await delay(15);
      }
    }
    send({ id, ok: true, result: { pid: process.pid } });
  }).catch(error => { process.stderr.write(error.message); process.exit(2); });
});
