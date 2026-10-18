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

  const states = new Map();
  let bridge = null;
  let starting = null;
  const exePath = config.helperPath ?? HELPER_EXE;

  async function startBridge() {
    const built = ensureHelper({ exe: exePath, log: warn });
    // The in-use indicator is a second exe; build it eagerly so the very first
    // action already shows the breathing frame instead of a silent no-op.
    try { ensureOverlay({ log: warn }); } catch (error) { warn('overlay build skipped: ' + error.message); }
    return new HelperBridge({ exe: built.exe, timeoutMs: config.timeoutMs, log: warn });
  }

  async function getBridge() {
    if (bridge !== null) return bridge;
    if (starting === null) starting = startBridge();
    try {
      bridge = await starting;
      return bridge;
    } catch (error) {
      starting = null;
      throw error;
    }
  }

  let configured = false;
  let lastToken = null;

  async function request(method, params = {}, opts = {}) {
    const active = await getBridge();

    if (!configured) {
      // The helper refuses windows whose app was never approved; keep that switch in
      // sync with the plugin policy.
      try {
        await active.request('configure', { requireAppApproval: config.appConsent !== 'never' }, { timeoutMs: config.timeoutMs });
      } catch { /* older helper */ }
      configured = true;
    }

    const token = opts.turnToken;
    if (token !== undefined && token !== lastToken) {
      if (lastToken !== null) {
        // Turn boundary: drop element snapshots, screenshot regions and the Esc block.
        try { await active.request('end_turn', {}, { timeoutMs: 5000 }); } catch { /* best effort */ }
      }
      lastToken = token;
    }

    const timeoutMs = opts.timeoutMs ?? (method === 'launch_app' ? config.launchTimeoutMs : config.timeoutMs);
    return active.request(method, params, { ...opts, timeoutMs });
  }

  const describeHelper = () => {
    try {
      return {
        path: exePath,
        exists: fs.existsSync(exePath),
        fresh: isHelperFresh(exePath),
        compiler: findCompiler(),
        overlay: isOverlayFresh(),
        platform: process.platform,
      };
    } catch (error) {
      return { path: exePath, error: error.message };
    }
  };

  const disposers = [];
  for (const definition of buildTools(config, { request, ctx, log: warn, states, describeHelper })) {
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
    ctx.on('dispose', () => {
      // The overlay hides the system cursor while it is up; make sure teardown puts it
      // back even if the overlay process was killed instead of exiting cleanly.
      try { bridge?.request('restore_cursor', {}, { timeoutMs: 2000, skipTurnTransition: false }); } catch { /* best effort */ }
      try { bridge?.dispose(); } catch { /* already gone */ }
      bridge = null;
      for (const dispose of disposers) {
        try { dispose(); } catch { /* registry may be tearing down */ }
      }
    });
  }
}

export { resolveConfig, buildTools, HelperBridge };
export default { name, inject, apply };
