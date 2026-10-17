/**
 * Configuration for dsh-computer-use-windows.
 *
 * Every field has a safe default: an empty config block must boot without
 * touching a mouse, a keyboard, or the network.
 *
 * @module dsh-computer-use-windows/config
 */

/** Accessible names that almost always carry an irreversible side effect. */
export const DEFAULT_RISKY_PATTERN =
  '(\\bdelete\\b|\\bremove\\b|\\buninstall\\b|\\bformat\\b|\\berase\\b|\\bwipe\\b|\\breset\\b|' +
  '\\bpay\\b|\\bpurchase\\b|\\bbuy\\b|\\btransfer\\b|\\bsubmit\\b|\\bsend\\b|\\bpublish\\b|\\bpost\\b|' +
  '\\binstall\\b|删除|移除|卸载|格式化|清空|重置|支付|付款|转账|购买|下单|提交|发送|发布|安装|运行)';

const DEFAULTS = {
  /** 'never' | 'sensitive' | 'always' — when to ask the DSH approval seam. */
  approval: 'sensitive',
  /** Empty array means "every app is reachable". Substrings of exe path or process name. */
  allowApps: [],
  denyApps: [],
  /** Codex parity: get_window_state captures a screenshot unless told otherwise. */
  defaultIncludeScreenshot: true,
  maxElements: 260,
  snapshotTtlMs: 120000,
  /** Codex waits for the UI to settle before the next capture; same idea here. */
  settleMs: 1000,
  /** Ask once per app before Computer Use touches it ('session') or never ('never'). */
  appConsent: 'session',
  /** Apps whose screenshots must never be captured (substring match on path/name). */
  redactApps: [],
  /** WASAPI loopback recording tools (Codex gates the same feature behind SKY_ENABLE_AUDIO). */
  audio: false,
  /** Record actions in the result instead of injecting them (integration rehearsals). */
  dryRun: false,
  /** Prefix for every tool name, e.g. 'cu_' when another plugin already owns click/type_text. */
  toolPrefix: '',
  /** Request budget. Codex uses 10s for ordinary calls and 15s for launch_app. */
  timeoutMs: 10000,
  launchTimeoutMs: 15000,
  helperPath: null,
  riskyPattern: DEFAULT_RISKY_PATTERN,
};

const APPROVAL_MODES = new Set(['never', 'sensitive', 'always']);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function stringList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.map(item => String(item).trim()).filter(item => item.length > 0);
}

/**
 * Normalize an untrusted config block into the resolved shape the plugin uses.
 * Unknown keys are dropped; invalid values fall back instead of throwing so a
 * bad config can never keep the host from starting.
 */
export function resolveConfig(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const approval = APPROVAL_MODES.has(input.approval) ? input.approval : DEFAULTS.approval;
  let riskyPattern = DEFAULTS.riskyPattern;
  if (typeof input.riskyPattern === 'string' && input.riskyPattern.length > 0) {
    try {
      new RegExp(input.riskyPattern);
      riskyPattern = input.riskyPattern;
    } catch {
      riskyPattern = DEFAULTS.riskyPattern;
    }
  }
  return {
    approval,
    allowApps: stringList(input.allowApps, DEFAULTS.allowApps),
    denyApps: stringList(input.denyApps, DEFAULTS.denyApps),
    defaultIncludeScreenshot: input.defaultIncludeScreenshot !== false,
    maxElements: clampInt(input.maxElements, 20, 2000, DEFAULTS.maxElements),
    snapshotTtlMs: clampInt(input.snapshotTtlMs, 1000, 3600000, DEFAULTS.snapshotTtlMs),
    settleMs: clampInt(input.settleMs, 0, 10000, DEFAULTS.settleMs),
    appConsent: input.appConsent === 'never' ? 'never' : DEFAULTS.appConsent,
    redactApps: stringList(input.redactApps, DEFAULTS.redactApps),
    audio: input.audio === true,
    dryRun: input.dryRun === true,
    toolPrefix: typeof input.toolPrefix === 'string' ? input.toolPrefix : DEFAULTS.toolPrefix,
    timeoutMs: clampInt(input.timeoutMs, 1000, 120000, DEFAULTS.timeoutMs),
    launchTimeoutMs: clampInt(input.launchTimeoutMs, 1000, 120000, DEFAULTS.launchTimeoutMs),
    helperPath: typeof input.helperPath === 'string' && input.helperPath.length > 0 ? input.helperPath : null,
    riskyPattern,
  };
}

export { DEFAULTS };
