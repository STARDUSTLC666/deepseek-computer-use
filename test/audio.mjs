import { ensurePrepared, BIN_DIR } from '../lib/build-helper.mjs';
import { HelperBridge } from '../lib/bridge.js';

const bridge = new HelperBridge({ exe: (await ensurePrepared()).helperPath, timeoutMs: 20000, env: { DSH_CU_COMPONENT_DIR: BIN_DIR } });

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
