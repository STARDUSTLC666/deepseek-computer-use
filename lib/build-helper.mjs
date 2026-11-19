/** Prepare immutable Windows helper and overlay executables using the system C# compiler. */
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildCleanWin32Env, PROTOCOL_VERSION } from './win32-env.js';

const run = promisify(execFile);
export const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const NATIVE_DIR = path.join(PLUGIN_ROOT, 'native');
export const BIN_DIR = path.join(NATIVE_DIR, 'bin');
const HELPER_NAME = 'dsh-computer-use-helper.exe';
const OVERLAY_NAME = 'dsh-cu-overlay.exe';
const sources = ['Json.cs', 'Driver.cs', 'Program.cs'];
const overlaySource = 'Overlay.cs';
const sourcePath = name => path.join(NATIVE_DIR, name);
const lockTimeout = 45000;

function localDirectory() {
  return path.join(process.env.LOCALAPPDATA || os.homedir(), 'dsh-computer-use');
}

export function findCompiler() {
  const dotnet = path.join(buildCleanWin32Env().SystemRoot, 'Microsoft.NET');
  return ['Framework64', 'Framework'].map(dir => path.join(dotnet, dir, 'v4.0.30319', 'csc.exe')).find(fs.existsSync) ?? null;
}

function references() {
  const root = path.join(buildCleanWin32Env().SystemRoot, 'Microsoft.NET', 'assembly', 'GAC_MSIL');
  return ['WindowsBase', 'UIAutomationClient', 'UIAutomationTypes'].map(name => {
    const directory = path.join(root, name);
    const candidate = fs.readdirSync(directory).map(version => path.join(directory, version, name + '.dll')).find(fs.existsSync);
    if (!candidate) throw new Error('cannot find .NET Framework assembly ' + name);
    return '/r:' + candidate;
  });
}

function nonEmpty(file) {
  try { const stat = fs.statSync(file); return stat.isFile() && stat.size > 0; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

export async function acquireLock(root, name = 'build.lock') {
  await fs.promises.mkdir(root, { recursive: true });
  const lock = path.join(root, name);
  const owner = path.join(lock, process.pid + '-' + randomUUID());
  const started = Date.now();
  while (Date.now() - started < lockTimeout) {
    try {
      await fs.promises.mkdir(lock);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const entries = await fs.promises.readdir(lock);
        const previous = entries.find(name => /^\d+-[a-f\d-]+$/.test(name));
        if (previous && !processAlive(Number(previous.split('-')[0]))) {
          // Only the contender that removed the previous owner's unique marker reaps the lock.
          await fs.promises.unlink(path.join(lock, previous));
          await fs.promises.rmdir(lock);
        } else if (entries.length === 0 && Date.now() - (await fs.promises.stat(lock)).mtimeMs > 10000) {
          await fs.promises.rmdir(lock);
        }
      } catch (failure) {
        if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(failure.code)) throw failure;
      }
      await delay(75);
      continue;
    }
    try { await fs.promises.writeFile(owner, '', { flag: 'wx' }); }
    catch (error) { await fs.promises.rmdir(lock).catch(() => {}); throw error; }
    return async () => {
      await fs.promises.unlink(owner);
      await fs.promises.rmdir(lock);
    };
  }
  throw new Error('timed out waiting for the Computer Use build lock');
}

async function prepareAt(root, buildHash, content, log) {
  const prepared = path.join(root, 'prepared');
  const directory = path.join(prepared, buildHash);
  const helperPath = path.join(directory, HELPER_NAME);
  const overlayPath = path.join(directory, OVERLAY_NAME);
  const result = { buildHash, protocolVersion: PROTOCOL_VERSION, helperPath, overlayPath };
  await fs.promises.mkdir(prepared, { recursive: true });
  let built = false;
  if (!nonEmpty(helperPath) || !nonEmpty(overlayPath)) {
    const compiler = findCompiler();
    if (!compiler) throw new Error('cannot build the Computer Use helper: Windows .NET Framework csc.exe was not found');
    const stage = await fs.promises.mkdtemp(path.join(prepared, buildHash + '-'));
    try {
      for (const [name, bytes] of content) await fs.promises.writeFile(path.join(stage, name), bytes);
      const compile = (target, name, inputs, refs) => run(compiler, [
        '/nologo', '/target:' + target, '/platform:anycpu', '/out:' + path.join(stage, name),
        ...inputs.map(file => path.join(stage, file)), ...refs,
      ], { windowsHide: true, env: buildCleanWin32Env(), timeout: 20000 });
      log?.('[dsh-computer-use] preparing Windows helper ' + buildHash);
      await compile('exe', HELPER_NAME, sources, [...references(), '/r:System.Drawing.dll']);
      await compile('winexe', OVERLAY_NAME, [overlaySource], ['/r:System.Windows.Forms.dll', '/r:System.Drawing.dll']);
      if (!nonEmpty(path.join(stage, HELPER_NAME)) || !nonEmpty(path.join(stage, OVERLAY_NAME))) throw new Error('native compiler produced an empty executable');
      for (const [name] of content) await fs.promises.unlink(path.join(stage, name));
      await fs.promises.rename(stage, directory);
      built = true;
    } finally {
      // Only the files written by this invocation are cleaned up on a failed build.
      for (const name of [...sources, overlaySource, HELPER_NAME, OVERLAY_NAME]) {
        await fs.promises.unlink(path.join(stage, name)).catch(() => {});
      }
      await fs.promises.rmdir(stage).catch(() => {});
    }
  }
  const current = path.join(root, 'current.json');
  let existing;
  try { existing = JSON.parse(await fs.promises.readFile(current, 'utf8')); } catch { /* recreate the pointer */ }
  if (existing?.buildHash !== buildHash || existing?.helperPath !== helperPath || existing?.overlayPath !== overlayPath) {
    const temporary = path.join(root, 'current-' + randomUUID() + '.json');
    try {
      await fs.promises.writeFile(temporary, JSON.stringify({ ...result, builtAt: new Date().toISOString() }));
      await fs.promises.rename(temporary, current);
    } finally { await fs.promises.unlink(temporary).catch(() => {}); }
  }
  return { ...result, built };
}

export async function ensurePrepared({ log } = {}) {
  if (process.platform !== 'win32') throw new Error('the Computer Use helper requires Windows');
  const hash = createHash('sha256').update(String(PROTOCOL_VERSION));
  const content = [...sources, overlaySource].map(name => [name, fs.readFileSync(sourcePath(name))]);
  for (const [name, bytes] of content) hash.update(name).update('\0').update(bytes);
  const buildHash = hash.digest('hex').slice(0, 16);
  const release = await acquireLock(localDirectory());
  try {
    try { return await prepareAt(path.join(NATIVE_DIR, '.build'), buildHash, content, log); }
    catch (error) {
      if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw error;
      return await prepareAt(localDirectory(), buildHash, content, log);
    }
  } finally { await release(); }
}
