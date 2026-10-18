/**
 * Lifecycle and framing for the native helper process.
 *
 * One long-lived helper owns the UI Automation element cache, so element
 * indexes returned by get_window_state stay resolvable by click/set_value.
 * Requests are serialized: UI Automation calls are not reentrant and a
 * desynchronized element cache is worse than waiting a few milliseconds.
 *
 * @module deepseek-computer-use/bridge
 */
import { spawn } from 'node:child_process';

/** Protocol version this plugin speaks; the helper reports its own in `hello`. */
const MIN_PROTOCOL = 1;

/** Codex's wording, reused verbatim so the model reacts the same way. */
const ESC_MESSAGE = 'Computer Use was stopped by the user with the physical Escape key. Stop your work, do not call further Computer Use tools in this turn, and send a final message noting that the user stopped Computer Use.';

/** An error raised by the helper, carrying its machine-readable code. */
export class HelperError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'HelperError';
    this.code = code;
    this.details = details;
  }
}

export class HelperBridge {
  #child = null;
  #buffer = '';
  #pending = new Map();
  #seq = 0;
  #queue = Promise.resolve();
  #exe;
  #timeoutMs;
  #protocol = null;
  #interruptedTurn = null;
  #lastTurn = null;
  #disposed = false;
  #log;

  constructor({ exe, timeoutMs = 20000, log } = {}) {
    if (typeof exe !== 'string' || exe.length === 0) throw new Error('HelperBridge requires an executable path');
    this.#exe = exe;
    this.#timeoutMs = timeoutMs;
    this.#log = log;
  }

  get running() {
    return this.#child !== null && this.#child.exitCode === null && !this.#child.killed;
  }

  #ensureChild() {
    if (this.#disposed) throw new HelperError('disposed', 'the Computer Use bridge was disposed');
    if (this.running) return this.#child;
    const child = spawn(this.#exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => this.#onData(chunk));
    child.stderr.on('data', chunk => {
      const text = String(chunk).trim();
      if (text.length > 0) this.#log?.('[dsh-computer-use] helper stderr: ' + text);
    });
    child.on('exit', (code, signal) => {
      this.#child = null;
      this.#protocol = null;
      // Codex's helper exits 130 when the user presses Esc; the transport turns that
      // into the interrupt error so the model stops instead of retrying.
      const interrupted = code === 130;
      if (interrupted && this.#lastTurn !== null) this.#interruptedTurn = this.#lastTurn;
      const reason = interrupted
        ? ESC_MESSAGE
        : 'the Computer Use helper exited (code ' + code + ', signal ' + signal + ')';
      for (const [, entry] of this.#pending) {
        clearTimeout(entry.timer);
        entry.reject(new HelperError(interrupted ? 'cancelled_by_user' : 'helper_exited', reason));
      }
      this.#pending.clear();
    });
    child.on('error', error => {
      this.#log?.('[dsh-computer-use] helper spawn error: ' + error.message);
    });
    this.#child = child;
    return child;
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let index = this.#buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.#buffer.slice(0, index).trim();
      this.#buffer = this.#buffer.slice(index + 1);
      if (line.length > 0) this.#settle(line);
      index = this.#buffer.indexOf('\n');
    }
  }

  #settle(line) {
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      this.#log?.('[dsh-computer-use] helper produced non-JSON output: ' + line.slice(0, 200));
      return;
    }
    const entry = this.#pending.get(payload.id);
    if (entry === undefined) return;
    this.#pending.delete(payload.id);
    clearTimeout(entry.timer);
    if (payload.ok === true) entry.resolve(payload.result);
    else entry.reject(new HelperError(payload.error?.code ?? 'helper_error', payload.error?.message ?? 'the helper reported an unknown failure', payload.error));
  }

  /**
   * Send one request. Calls are serialized through the queue; a caller that
   * never gets an answer fails on the timeout rather than hanging the turn.
   */
  request(method, params = {}, { signal, timeoutMs, turnToken } = {}) {
    const wire = turnToken === undefined ? params : { ...params, turnToken };
    if (turnToken !== undefined) this.#lastTurn = turnToken;
    const run = async () => {
      // Codex stops issuing input for the rest of a turn once the user hits Esc.
      // The helper persists the same fact, but failing here keeps the error
      // immediate even while a fresh helper process is spinning up.
      if (turnToken !== undefined && this.#interruptedTurn === turnToken) {
        throw new HelperError('turn_stopped', ESC_MESSAGE);
      }
      await this.#ensureProtocol(signal);
      try {
        return await this.#call(method, wire, { signal, timeoutMs });
      } catch (error) {
        if ((error?.code === 'cancelled_by_user' || error?.code === 'turn_stopped') && turnToken !== undefined) {
          this.#interruptedTurn = turnToken;
        }
        throw error;
      }
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.then(() => undefined, () => undefined);
    return next;
  }

  /**
   * The helper reports `protocolVersion` from `hello`. Codex exposes the same fact as
   * `window_protocol_version`; checking it up front turns a silent mismatch into one
   * clear error instead of a stream of malformed-stream failures.
   */
  async #ensureProtocol(signal) {
    if (this.#protocol !== null) return;
    const hello = await this.#call('hello', {}, { signal, timeoutMs: 5000 });
    const version = Number(hello?.protocolVersion);
    if (!Number.isFinite(version) || version < MIN_PROTOCOL) {
      throw new HelperError('protocol_mismatch',
        'the Computer Use helper speaks protocol ' + (hello?.protocolVersion ?? 'unknown') +
        ', this plugin needs ' + MIN_PROTOCOL + ' or newer. Reinstall deepseek-computer-use so the helper and the plugin match.');
    }
    this.#protocol = version;
  }

  #call(method, params, { signal, timeoutMs }) {
    if (signal?.aborted) return Promise.reject(new HelperError('cancelled', 'the request was cancelled before it started'));
    const child = this.#ensureChild();
    const id = ++this.#seq;
    const budgetMs = Number.isFinite(timeoutMs) ? timeoutMs : this.#timeoutMs;
    // Codex ships the budget with every call as x-oai-cua-request-budget-ms so the
    // helper can bound its own waits; the same deadline travels here.
    const payload = JSON.stringify({ id, method, params: { ...params, __budgetMs: budgetMs } });

    const raw = new Promise((resolve, reject) => {
      const budget = Number.isFinite(timeoutMs) ? timeoutMs : this.#timeoutMs;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new HelperError('timeout', 'the Computer Use helper did not answer ' + method + ' within ' + budget + 'ms'));
      }, budget);
      timer.unref?.();

      const onAbort = () => {
        this.#pending.delete(id);
        clearTimeout(timer);
        reject(new HelperError('cancelled', 'the request was cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      this.#pending.set(id, {
        timer,
        resolve: value => {
          signal?.removeEventListener('abort', onAbort);
          resolve(value);
        },
        reject: error => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      });

      try {
        child.stdin.write(payload + '\n');
      } catch (error) {
        this.#pending.delete(id);
        clearTimeout(timer);
        reject(new HelperError('write_failed', 'cannot talk to the Computer Use helper: ' + error.message));
      }
    });
    // The caller always handles this promise; the extra branch only stops Node from
    // treating a momentarily unobserved rejection as a fatal unhandled one.
    raw.catch(() => { /* observed by the caller; this branch only silences Node */ });
    return raw;
  }

  dispose() {
    this.#disposed = true;
    const child = this.#child;
    this.#child = null;
    if (child !== null) {
      // Codex closes the helper with a close RPC before tearing the process down.
      try {
        child.stdin.write(JSON.stringify({ id: ++this.#seq, method: 'close', params: {} }) + '\n');
      } catch { /* already gone */ }
      try { child.stdin.end(); } catch { /* already gone */ }
      setTimeout(() => { try { child.kill(); } catch { /* already gone */ } }, 150).unref?.();
    }
  }
}
