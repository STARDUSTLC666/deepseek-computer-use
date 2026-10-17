/**
 * Safety layers for dsh-computer-use-windows.
 *
 * Three independent gates, in the order the action hits them:
 *   1. hard deny   - never automatable, not even with user approval
 *                    (terminals, Run dialog, password managers, security
 *                     software, auth dialogs, the agent's own app, Win key)
 *   2. reachability - is this app inside allowApps and outside denyApps?
 *   3. confirmation - should the user approve this specific action?
 *
 * Ported from Codex's computer-use guidance.md ("Non-negotiable Windows
 * Automation Safety") and confirmations.md.
 *
 * @module dsh-computer-use-windows/safety
 */

export class PolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
  }
}

/**
 * Processes that must never be driven by UI automation.
 * Matched as lowercase substrings against the exe path, process name and title.
 */
export const HARD_DENY_APPS = [
  // terminals and shells
  'windowsterminal', 'windows terminal', 'wt.exe', 'cmd.exe', 'conhost', 'consolewindowclass',
  'powershell.exe', 'pwsh.exe', 'powershell ise', 'mintty', 'git-bash', 'bash.exe', 'wsl.exe', 'ubuntu.exe',
  // launch surfaces that can run arbitrary commands
  'run dialog', '运行', 'shellexperiencehost',
  // credential stores
  '1password', 'keepass', 'bitwarden', 'lastpass', 'dashlane', 'keeper', 'enpass', 'nordpass', 'roboform',
  // security and anti-malware
  'securityhealth', 'windows security', 'windows 安全中心', 'msmpeng', 'defender', 'malwarebytes',
  'avast', 'avg', 'kaspersky', 'bitdefender', 'eset', 'norton', 'mcafee', 'sophos', 'crowdstrike', 'sentinelone',
  // authentication and elevation surfaces
  'consent.exe', 'credentialuibroker', 'logonui', 'useraccountcontrol',
  // the agent's own host and other assistants: automating them invites prompt loops
  'deepseek harness', 'chatgpt', 'codex',
];

/** Window classes that are terminal-like regardless of the owning exe name. */
const HARD_DENY_CLASSES = [
  'consolewindowclass', 'cascadia_hosting_window_class', 'mintty', '#32770',
];

/** Key tokens that are banned outright (Windows key family). */
const DENY_KEY_TOKENS = new Set([
  'win', 'win_l', 'win_r', 'lwin', 'rwin', 'super', 'super_l', 'super_r', 'meta', 'meta_l', 'meta_r',
  'cmd', 'command', 'os', 'os_l', 'os_r', 'windows', 'windows_l', 'windows_r', 'lwindows', 'rwindows',
]);

function lower(value) {
  return String(value ?? '').toLowerCase();
}

function matchesAny(haystack, needles) {
  const value = lower(haystack);
  return needles.some(needle => value.includes(needle.toLowerCase()));
}

/**
 * Gate 1: refuse windows that must never be automated.
 * Runs before allowApps/denyApps so a user cannot opt into it by accident.
 */
export function assertNotHardDenied(window, extraDeny = HARD_DENY_APPS) {
  const app = window?.app ?? {};
  const fields = {
    appId: String(app.id ?? ''),
    appName: String(app.name ?? ''),
    displayName: String(app.displayName ?? ''),
    title: String(window?.title ?? ''),
    className: String(window?.className ?? ''),
  };
  const hit = Object.values(fields).find(value => matchesAny(value, extraDeny));
  if (hit !== undefined) {
    throw new PolicyError(
      'hard_denied',
      'Computer Use refuses to automate "' + (fields.title || fields.appName || fields.className) +
        '": terminals, Run dialogs, credential stores, security software, authentication dialogs and the agent host are hard-denied and cannot be approved.',
    );
  }
  const deniedClass = HARD_DENY_CLASSES.find(name => fields.className.toLowerCase().startsWith(name));
  if (deniedClass !== undefined) {
    throw new PolicyError(
      'hard_denied',
      'Computer Use refuses to automate window class "' + fields.className + '": console/dialog classes are hard-denied (Run dialog, terminals, generic system dialogs).',
    );
  }
}

/**
 * Gate 1 for keyboard: the Windows key family is banned, alone or in a chord.
 * Windows+anything can open Run, Settings, lock the desktop or trigger shell jumps.
 */
export function assertKeyAllowed(key) {
  const parts = String(key ?? '').split('+').map(part => lower(part).trim()).filter(part => part.length > 0);
  const banned = parts.find(part => DENY_KEY_TOKENS.has(part));
  if (banned !== undefined) {
    throw new PolicyError(
      'hard_denied',
      'the Windows/Meta/Super key ("' + banned + '") is hard-denied: it opens Run, Settings and shell surfaces that Computer Use must never drive.',
    );
  }
}

/** Gate 1 for launch targets. */
export function assertLaunchAllowed(app) {
  const value = lower(app);
  const banned = HARD_DENY_APPS.find(needle => value.includes(needle.toLowerCase()));
  if (banned !== undefined) {
    throw new PolicyError('hard_denied', 'Computer Use refuses to launch "' + app + '": that surface is hard-denied.');
  }
}

/** Gate 2: allowApps / denyApps. */
export function assertAppAllowed(config, app, window) {
  const id = String(app?.id ?? '');
  const name = String(app?.name ?? app?.displayName ?? '');
  const title = String(window?.title ?? '');
  if (matchesAny(id, config.denyApps) || matchesAny(name, config.denyApps) || matchesAny(title, config.denyApps)) {
    throw new PolicyError('app_denied', 'the Computer Use policy denies app "' + (name || id) + '" (denyApps)');
  }
  if (config.allowApps.length > 0 && !matchesAny(id, config.allowApps) && !matchesAny(name, config.allowApps)) {
    throw new PolicyError('app_not_allowed', 'app "' + (name || id) + '" is outside allowApps; add it to the plugin config to permit this action');
  }
}

/** The accessible label an action would hit, from the cached observation. */
export function labelOfElement(state, elementIndex) {
  if (state === undefined || elementIndex === undefined || elementIndex === null) return '';
  const elements = state.elements;
  if (!Array.isArray(elements)) return '';
  const hit = elements.find(element => Number(element.index) === Number(elementIndex));
  if (hit === undefined) return '';
  return String(hit.name ?? '') + ' ' + String(hit.role ?? '');
}

/**
 * Gate 3: decide whether an action needs a human answer.
 * 'sensitive' asks when the target label looks irreversible; launch_app always asks;
 * 'always' asks for everything.
 */
export function needsApproval(config, { toolName, label = '' }) {
  if (config.approval === 'never') return false;
  if (config.approval === 'always') return true;
  if (toolName === 'launch_app') return true;
  if (label.length === 0) return false;
  try {
    return new RegExp(config.riskyPattern, 'i').test(label);
  } catch {
    return false;
  }
}

/**
 * Ask the DSH approval seam and fail closed.
 * A missing answerer rejects the action; it never silently proceeds.
 */
export async function requestApproval(ctx, exec, { toolName, reason }) {
  const approval = ctx?.get?.('approval');
  // The user's session preset may disable prompting entirely ("approval: never",
  // e.g. the full-access preset). Honour that instead of failing every action:
  // the hard denies above still apply, and asking would only return "rejected".
  try {
    if (typeof approval?.effectivePolicy === 'function') {
      const policy = approval.effectivePolicy(exec?.agent?.session);
      if (policy === 'never') return;
    }
  } catch { /* policy lookup is best effort */ }
  if (approval === undefined || approval === null || typeof approval.request !== 'function') {
    throw new PolicyError(
      'approval_unavailable',
      'this action needs user confirmation but no approval service is mounted; switch the session approval policy or change approval mode in the plugin config',
    );
  }
  const outcome = await approval.request({
    agent: exec?.agent,
    toolName,
    callId: exec?.callId,
    reason,
    signal: exec?.signal,
  });
  if (outcome !== 'allowed-once') {
    throw new PolicyError('approval_denied', 'the user did not approve this action (' + outcome + ')');
  }
}

/**
 * Codex stops issuing input once a turn ends. The DSH session log is the only
 * place that knows, so read it defensively: an unknown session shape never
 * blocks an action, but a provably closed turn does.
 */
export function assertTurnOpen(exec) {
  const session = exec?.agent?.session;
  if (session === undefined || session === null) return;
  if (typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return;
  const floor = Math.max(0, session.seq - 400);
  for (let index = session.seq - 1; index >= floor; index -= 1) {
    let type;
    try { type = session.eventAt(index)?.type; } catch { return; }
    if (type === 'turn/start') return;
    if (type === 'turn/end') {
      throw new PolicyError('turn_ended', 'the turn that requested this action has ended, so Computer Use stops issuing input. Ask the user to continue in a new turn.');
    }
  }
}

/**
 * A token that identifies the current turn. Codex blocks further Computer Use
 * calls for the rest of a turn once the user hits Esc; the helper cannot know
 * about turns, so the plugin sends this token with every call.
 */
export function turnTokenOf(exec) {
  const session = exec?.agent?.session;
  if (session === undefined || session === null) return 'none';
  if (typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return 'none';
  const floor = Math.max(0, session.seq - 400);
  for (let index = session.seq - 1; index >= floor; index -= 1) {
    let type;
    try { type = session.eventAt(index)?.type; } catch { return 'none'; }
    if (type === 'turn/start') {
      // Include the session so a persisted Esc marker can never block a later session
      // that happens to reuse the same turn index (Codex scopes markers the same way).
      const id = session.id ?? session.sessionId ?? session.key;
      const scope = typeof id === 'string' && id.length > 0 ? id : 'session';
      return scope + ':' + 'turn-' + index;
    }
  }
  return 'none';
}

/**
 * Windows whose pixels must never leave the machine ("appshot" guard). Codex mounts a
 * prepared overlay around the capture; here the same intent is enforced by refusing the
 * screenshot for the listed apps and reporting it.
 */
export function isRedacted(config, app) {
  const list = Array.isArray(config?.redactApps) ? config.redactApps : [];
  if (list.length === 0) return false;
  const haystack = (String(app?.id ?? '') + ' ' + String(app?.name ?? '') + ' ' + String(app?.displayName ?? '')).toLowerCase();
  return list.some(needle => haystack.includes(String(needle).toLowerCase()));
}
