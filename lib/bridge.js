/** Serialized native RPC, with cancellation that waits for the owned process to stop. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const MIN_PROTOCOL = 2;
const ESC_MESSAGE = 'Computer Use was stopped by the user with the physical Escape key. Stop your work, do not call further Computer Use tools in this turn, and send a final message noting that the user stopped Computer Use.';

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
  #closed = new WeakMap();
  #termination = new WeakMap();
  #reasons = new WeakMap();
  #buffer = '';
  #pending = new Map();
  #seq = 0;
  #queue = Promise.resolve();
  #stopping = Promise.resolve();
  #exe;
  #args;
  #cancelDirectory;
  #timeoutMs;
  #protocol = null;
  #stoppedTurns = new Map();
  #lastTurn = null;
  #disposed = false;
  #log;

  constructor({ exe, args = [], cancelDirectory, timeoutMs = 20000, log } = {}) {
    if (typeof exe !== 'string' || exe.length === 0) throw new Error('HelperBridge requires an executable path');
    this.#exe = exe;
    this.#args = args;
    this.#cancelDirectory = cancelDirectory ?? path.join(os.tmpdir(), 'dsh-computer-use-requests');
    this.#timeoutMs = timeoutMs;
    this.#log = log;
  }

  get running() { return this.#child !== null && this.#child.exitCode === null && this.#child.signalCode === null; }
  get pid() { return this.running ? this.#child.pid : null; }

  #ensureChild() {
    if (this.#disposed) throw new HelperError('disposed', 'the Computer Use bridge was disposed');
    if (this.running) return this.#child;
    const child = spawn(this.#exe, this.#args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.#child = child;
    this.#buffer = '';
    this.#protocol = null;
    this.#closed.set(child, new Promise(resolve => child.once('close', resolve)));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (this.#child === child) this.#onData(child, chunk); });
    child.stderr.on('data', chunk => this.#log?.('[dsh-computer-use] helper: ' + String(chunk).trim().slice(0, 500)));
    child.stdin.on('error', error => this.#stop(child, new HelperError('write_failed', error.message)));
    child.on('error', error => {
      this.#reasons.set(child, new HelperError('helper_start_failed', error.message));
    });
    child.on('close', (code, signal) => {
      const escaped = code === 130;
      if (escaped && this.#lastTurn !== null) this.#stoppedTurns.set(this.#lastTurn, new HelperError('turn_stopped', ESC_MESSAGE));
      const error = this.#reasons.get(child) ?? new HelperError(escaped ? 'cancelled_by_user' : 'helper_exited',
        escaped ? ESC_MESSAGE : 'the Computer Use helper exited (code ' + code + ', signal ' + signal + ')');
      if (this.#child === child) {
        this.#child = null;
        this.#protocol = null;
        this.#buffer = '';
      }
      this.#rejectChild(child, error);
    });
    return child;
  }

  #rejectChild(child, error) {
    for (const [id, entry] of this.#pending) {
      if (entry.child !== child) continue;
      this.#pending.delete(id);
      entry.cleanup();
      entry.reject(error);
    }
  }

  #stop(child, error) {
    const stopped = this.#terminate(child, error);
    stopped.catch(failure => this.#rejectChild(child, failure));
    return stopped;
  }

  #terminate(child, error) {
    if (!child) return this.#stopping;
    if (this.#termination.has(child)) return this.#termination.get(child);
    this.#reasons.set(child, error);
    for (const entry of this.#pending.values()) {
      if (entry.child !== child) continue;
      entry.stopping = true;
      clearTimeout(entry.timer);
      try { fs.writeFileSync(entry.cancelFile, error.code, 'utf8'); } catch { /* forced stop below remains available */ }
    }
    const stop = (async () => {
      const closed = this.#closed.get(child);
      // Native input loops poll the marker and release held input in finally.
      // The close frame is processed once that request unwinds.
      try { child.stdin.write(JSON.stringify({ id: ++this.#seq, method: 'close', params: {} }) + '\n'); } catch { /* process already exited */ }
      let ended = await Promise.race([closed.then(() => true), delay(500).then(() => false)]);
      if (!ended) {
        child.kill('SIGKILL');
        ended = await Promise.race([closed.then(() => true), delay(2000).then(() => false)]);
      }
      if (!ended) {
        this.#disposed = true;
        throw new HelperError('helper_stop_failed', 'the Computer Use helper could not be stopped; no further Computer Use requests are allowed');
      }
    })();
    this.#termination.set(child, stop);
    this.#stopping = stop;
    return stop;
  }

  #onData(child, chunk) {
    this.#buffer += chunk;
    let newline;
    while ((newline = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line) continue;
      let payload;
      try { payload = JSON.parse(line); }
      catch {
        this.#stop(child, new HelperError('protocol_error', 'the Computer Use helper returned invalid JSON; take a fresh observation before retrying'));
        return;
      }
      const entry = this.#pending.get(payload?.id);
      if (!entry || entry.child !== child || entry.stopping) continue;
      if (typeof payload.ok !== 'boolean') {
        this.#stop(child, new HelperError('protocol_error', 'the Computer Use helper returned an invalid response'));
        return;
      }
      const code = payload.error?.code;
      if (!payload.ok && ['timeout', 'cancelled', 'cancelled_by_user', 'turn_stopped'].includes(code)) {
        if (['cancelled_by_user', 'turn_stopped'].includes(code) && entry.turnToken !== undefined) {
          this.#stoppedTurns.set(entry.turnToken, new HelperError('turn_stopped', ESC_MESSAGE));
        }
        this.#stop(child, new HelperError(code, payload.error.message));
        continue;
      }
      this.#pending.delete(payload.id);
      entry.cleanup();
      if (payload.ok) entry.resolve(payload.result);
      else entry.reject(new HelperError(code ?? 'helper_error', payload.error?.message ?? 'the helper request failed', payload.error));
    }
  }

  request(method, params = {}, { signal, timeoutMs, turnToken } = {}) {
    const run = async () => {
      await this.#stopping;
      if (this.#disposed) throw new HelperError('disposed', 'the Computer Use bridge was disposed');
      if (signal?.aborted) throw new HelperError('cancelled', 'the request was cancelled before it started');
      if (turnToken !== undefined && this.#stoppedTurns.has(turnToken)) throw this.#stoppedTurns.get(turnToken);
      if (turnToken !== undefined) this.#lastTurn = turnToken;
      if (this.#protocol === null) {
        const hello = await this.#call('hello', {}, { signal, timeoutMs: 5000, turnToken });
        if (!Number.isInteger(hello?.protocolVersion) || hello.protocolVersion < MIN_PROTOCOL) {
          const error = new HelperError('protocol_mismatch', 'the Computer Use helper must support cancellation protocol ' + MIN_PROTOCOL + '; rebuild the plugin helper');
          await this.#terminate(this.#child, error);
          throw error;
        }
        this.#protocol = hello.protocolVersion;
      }
      if (turnToken !== undefined && this.#stoppedTurns.has(turnToken)) throw this.#stoppedTurns.get(turnToken);
      return this.#call(method, params, { signal, timeoutMs, turnToken });
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  #call(method, params, { signal, timeoutMs, turnToken }) {
    if (signal?.aborted) return Promise.reject(new HelperError('cancelled', 'the request was cancelled before it started'));
    const child = this.#ensureChild();
    fs.mkdirSync(this.#cancelDirectory, { recursive: true });
    const cancelFile = path.join(this.#cancelDirectory, randomUUID() + '.flag');
    const id = ++this.#seq;
    const budget = timeoutMs ?? this.#timeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#stop(child, new HelperError('timeout',
        'the Computer Use helper exceeded ' + budget + 'ms for ' + method + '; take a fresh observation before retrying')), budget);
      const onAbort = () => {
        if (turnToken !== undefined) this.#stoppedTurns.set(turnToken, new HelperError('turn_stopped', 'Computer Use was cancelled in this turn; wait for a new turn'));
        this.#stop(child, new HelperError('cancelled', 'the Computer Use request was cancelled and its helper stopped'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        try { fs.unlinkSync(cancelFile); } catch { /* no marker was needed */ }
      };
      this.#pending.set(id, { child, cancelFile, timer, cleanup, resolve, reject, turnToken, stopping: false });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      try {
        child.stdin.write(JSON.stringify({ id, method, params: { ...params, ...(turnToken === undefined ? {} : { turnToken }), __budgetMs: budget, __cancelFile: cancelFile } }) + '\n', error => {
          if (error) this.#stop(child, new HelperError('write_failed', error.message));
        });
      } catch (error) { this.#stop(child, new HelperError('write_failed', error.message)); }
    });
  }

  stopTurn(turnToken) {
    const error = new HelperError('turn_ended', 'the requesting turn has ended; wait for a new turn and take a fresh observation');
    this.#stoppedTurns.set(turnToken, error);
    return this.#terminate(this.#child, error);
  }

  dispose() {
    this.#disposed = true;
    return this.#terminate(this.#child, new HelperError('disposed', 'the Computer Use bridge was disposed'));
  }
}
