import { performance } from 'node:perf_hooks';
import { registerUpdates } from '@stardustlc/dsh-updates';

const name = 'deepseek-computer-use';
const registries = ['registry.npmjs.org', 'registry.npmmirror.com'];

async function readManifest(response, signal) {
  if (!response.ok || !response.body) throw new Error('HTTP ' + response.status);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) throw new Error('registry response exceeds 128 KiB');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function probeRegistries(signal, fetchImpl = fetch) {
  const check = async registry => {
    const start = performance.now();
    const budget = AbortSignal.timeout(8000);
    const requestSignal = signal ? AbortSignal.any([signal, budget]) : budget;
    try {
      const response = await fetchImpl('https://' + registry + '/' + name + '/latest', {
        signal: requestSignal, redirect: 'error', cache: 'no-store',
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      });
      const release = await readManifest(response, requestSignal);
      if (release.name !== name || typeof release.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release.version)) {
        throw new Error('invalid registry manifest');
      }
      return { registry, version: release.version, elapsedMs: Math.round(performance.now() - start) };
    } catch (error) {
      signal?.throwIfAborted();
      return { registry, version: null, elapsedMs: Math.round(performance.now() - start),
        error: budget.aborted ? 'timeout' : 'registry-unavailable' };
    }
  };
  return Promise.all(registries.map(check));
}

// Reuse the install coordinator, its live activity/draft guards and Suite ownership detection.
// Registering this participant works when this is the only STARDUSTLC plugin in a profile.
export function registerPluginUpdater(ctx) {
  registerUpdates(ctx, { name });
}
