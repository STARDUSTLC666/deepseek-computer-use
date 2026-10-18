/**
 * deepseek-computer-use - Windows Computer Use for DeepSeek Harness.
 *
 * Registers the Codex window2 tool surface on top of a native Windows driver
 * (UI Automation + SendInput + PrintWindow). The heavy lifting lives in a
 * long-lived C# helper so element indexes stay valid across calls; this module
 * owns the DSH seams: tool registration, image attachment, approval gating and
 * config.
 *
 * @module deepseek-computer-use
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperBridge } from './bridge.js';
import { resolveConfig } from './config.js';
import { ensureHelper, ensureOverlay, findCompiler, HELPER_EXE, isHelperFresh, isOverlayFresh } from './build-helper.mjs';
import { buildTools } from './tools.js';
import { assertTurnOpen, turnTokenOf } from './safety.js';

export const name = 'deepseek-computer-use';
/** Only the tool registry is mandatory; skills/attachments/approval are optional. */
export const inject = ['tools'];

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(here, '..', 'skills', 'computer-use');

function readSkill() {
  try {
    const text = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(text);
    if (match === null) return null;
    let skillName = '';
    let description = '';
    for (const rawLine of match[1].split('\n')) {
      const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(rawLine.trim());
      if (keyMatch === null) continue;
      if (keyMatch[1] === 'name') skillName = keyMatch[2].replace(/^["']|["']$/g, '').trim();
      if (keyMatch[1] === 'description') description = keyMatch[2].replace(/^["']|["']$/g, '').trim();
    }
    const content = text.slice(match[0].length).trimStart();
    if (skillName === '' || description === '' || content.length === 0) return null;
    return { name: skillName, description, content };
  } catch {
    return null;
  }
}

export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  const warn = message => {
    try { ctx.logger?.warn?.(message); } catch { /* logger is optional */ }
  };

  // DSH exposes a single-provider "computerUse" service (key: computerUse,
  // register(name) -> release). Claiming it tells the host who is driving the
  // desktop; releasing it must happen only after our tools have stopped.
  // ctx.get throws when the service is absent, so probe defensively: a host without
  // the computerUse seam must still load the plugin's tools.
  let seam = null;
  try { seam = (typeof ctx.get === 'function' ? ctx.get('computerUse') : undefined) ?? ctx.computerUse ?? null; } catch { seam = null; }
  let seamState = 'unavailable';
  let releaseSeam = null;
  if (seam && typeof seam.register === 'function') {
    seamState = 'registering';
    Promise.resolve()
      .then(() => seam.register('deepseek-computer-use'))
      .then(release => { seamState = 'held'; releaseSeam = release; },
        error => { seamState = 'taken'; warn('the computerUse provider slot is already taken: ' + (error?.message ?? String(error))); });
  }

  const states = new Map();
  const runtimes = new Map();
  const defaultSession = Symbol('unscoped');
  let disposed = false;
  const exePath = config.helperPath ?? HELPER_EXE;
  let activeExePath = exePath;

  async function startBridge() {
    const built = ensureHelper({ exe: exePath, log: warn });
    activeExePath = built.exe;
    // The in-use indicator is a second exe; build it eagerly so the very first
    // action already shows the breathing frame instead of a silent no-op.
    try { ensureOverlay({ log: warn }); } catch (error) { warn('overlay build skipped: ' + error.message); }
    return new HelperBridge({ exe: built.exe, timeoutMs: config.timeoutMs, log: warn });
  }

  async function request(method, params = {}, opts = {}) {
    if (disposed) throw new Error('the Computer Use plugin was disposed');
    const key = opts.session ?? defaultSession;
    let runtime = runtimes.get(key);
    if (!runtime) {
      runtime = { bridge: await startBridge(), configured: false, lastToken: null };
      runtimes.set(key, runtime);
    }
    const active = runtime.bridge;
    if (!active.running) runtime.configured = false;

    if (!runtime.configured) {
      // The helper refuses windows whose app was never approved; keep that switch in
      // sync with the plugin policy.
      await active.request('configure', { requireAppApproval: config.appConsent !== 'never' }, { timeoutMs: config.timeoutMs, signal: opts.signal });
      runtime.configured = true;
    }

    const token = opts.turnToken;
    if (token !== undefined && token !== runtime.lastToken) {
      if (runtime.lastToken !== null) {
        // Turn boundary: drop element snapshots, screenshot regions and the Esc block.
        await active.request('end_turn', {}, { timeoutMs: 5000, signal: opts.signal });
      }
      runtime.lastToken = token;
    }

    const timeoutMs = opts.timeoutMs ?? (method === 'launch_app' ? config.launchTimeoutMs : config.timeoutMs);
    if (opts.session) assertTurnOpen({ agent: { session: opts.session } });
    try {
      return await active.request(method, params, { ...opts, timeoutMs });
    } catch (error) {
      if (active.running && !['configure', 'approve_app', 'invalidate_state'].includes(method)) {
        try { await active.request('invalidate_state', {}, { timeoutMs: 2000 }); } catch { /* transport failure stops the child */ }
      }
      throw error;
    }
  }

  const describeHelper = () => {
    try {
      return {
        path: activeExePath,
        exists: fs.existsSync(activeExePath),
        fresh: isHelperFresh(activeExePath),
        compiler: findCompiler(),
        overlay: isOverlayFresh(),
        platform: process.platform,
        pids: [...runtimes.values()].map(runtime => runtime.bridge.pid).filter(pid => pid !== null),
      };
    } catch (error) {
      return { path: exePath, error: error.message };
    }
  };

  const disposers = [];
  for (const definition of buildTools(config, { request, ctx, log: warn, states, describeHelper, describeSeam: () => seamState })) {
    disposers.push(ctx.tools.register(definition));
  }

  // Optional: publish the bundled operator guide as a DSH skill.
  try {
    const skills = ctx.get?.('skills') ?? ctx.skills;
    const skill = readSkill();
    if (skill !== null && skills !== undefined && typeof skills.register === 'function') {
      disposers.push(skills.register({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        resourceBase: { kind: 'directory', path: SKILL_DIR },
        source: 'runtime',
      }));
    }
  } catch (error) {
    warn('[dsh-computer-use] skill registration skipped: ' + error.message);
  }

  if (typeof ctx.on === 'function') {
    ctx.on('session/event', (session, event) => {
      if (event?.type !== 'turn/end') return;
      const runtime = runtimes.get(session);
      if (runtime) return runtime.bridge.stopTurn(turnTokenOf({ agent: { session } })).catch(error => warn(error.message));
    });
    ctx.on('session/disposed', session => {
      const runtime = runtimes.get(session);
      if (runtime) {
        runtimes.delete(session);
        return runtime.bridge.dispose().catch(error => warn(error.message));
      }
    });
    ctx.on('dispose', async () => {
      disposed = true;
      // The overlay hides the system cursor while it is up; make sure teardown puts it
      // back even if the overlay process was killed instead of exiting cleanly.
      // Put the pointer back before the bridges go away: the overlay may still be
      // hiding it, and a killed overlay cannot clean up after itself.
      await Promise.allSettled([...runtimes.values()].map(({ bridge }) =>
        bridge.request('restore_cursor', {}, { timeoutMs: 2000 }).catch(() => undefined)));
      await Promise.allSettled([...runtimes.values()].map(({ bridge }) => bridge.dispose()));
      runtimes.clear();
      for (const dispose of disposers) {
        try { dispose(); } catch { /* registry may be tearing down */ }
      }
      // The seam contract: stop the tools and await owned work *before* releasing
      // the provider slot, so the host never sees a provider with dead tools.
      if (releaseSeam !== null) {
        const release = releaseSeam;
        releaseSeam = null;
        seamState = 'released';
        try { await release(); } catch { /* the host may be shutting down */ }
      }
    });
  }
}

export { resolveConfig, buildTools, HelperBridge };
export default { name, inject, apply };
