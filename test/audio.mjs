import { HelperBridge } from '../lib/bridge.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridge = new HelperBridge({ exe: path.join(ROOT, 'native/bin/dsh-computer-use-helper.exe'), timeoutMs: 20000 });

try {
  const started = await bridge.request('start_audio_recording', { maxDurationMs: 5000 }, { turnToken: 't' });
  console.log('start:', JSON.stringify(started));
  await new Promise(r => setTimeout(r, 1800));
  const stopped = await bridge.request('stop_audio_recording', {}, { turnToken: 't' });
  console.log('stop:', JSON.stringify(stopped));
} catch (error) {
  console.log('audio error:', error.code, String(error.message).slice(0, 160));
}
bridge.dispose();
process.exit(0);
