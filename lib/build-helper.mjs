/**
 * Build the Windows helper with the system C# compiler.
 *
 * Why compile instead of shipping a binary: Windows 10/11 always carry
 * csc.exe (part of .NET Framework 4.x), so this needs no SDK, no npm native
 * module, and no build server. The exe is cached and rebuilt only when a
 * source file is newer.
 *
 * @module deepseek-computer-use/build-helper
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(here, '..');
export const NATIVE_DIR = path.join(PLUGIN_ROOT, 'native');
export const BIN_DIR = path.join(NATIVE_DIR, 'bin');
export const HELPER_EXE = path.join(BIN_DIR, 'dsh-computer-use-helper.exe');
export const OVERLAY_EXE = path.join(BIN_DIR, 'dsh-cu-overlay.exe');

const SOURCES = ['Json.cs', 'Driver.cs', 'Program.cs'].map(name => path.join(NATIVE_DIR, name));
const OVERLAY_SOURCES = ['Overlay.cs'].map(name => path.join(NATIVE_DIR, name));

/** GAC assembly paths the compiler needs (UIAutomation + WindowsBase are not default refs). */
const GAC_ROOT = 'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL';
const GAC_REFS = ['WindowsBase', 'UIAutomationClient', 'UIAutomationTypes'];

function cscCandidates() {
  return [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
}

function findGacAssembly(name) {
  const dir = path.join(GAC_ROOT, name);
  if (!fs.existsSync(dir)) return null;
  for (const version of fs.readdirSync(dir)) {
    const candidate = path.join(dir, version, name + '.dll');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function findCompiler() {
  for (const candidate of cscCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function isHelperFresh(exe = HELPER_EXE) {
  if (!fs.existsSync(exe)) return false;
  const exeTime = fs.statSync(exe).mtimeMs;
  return SOURCES.every(source => fs.existsSync(source) && fs.statSync(source).mtimeMs <= exeTime);
}

/**
 * Compile the helper if it is missing or stale.
 * @returns {{ exe: string, built: boolean, reason?: string }}
 */
export function ensureHelper({ force = false, exe = HELPER_EXE, log } = {}) {
  if (!force && isHelperFresh(exe)) return { exe, built: false };
  if (process.platform !== 'win32') return { exe, built: false, reason: 'not-windows' };

  const compiler = findCompiler();
  if (compiler === null) throw new Error('cannot build the Computer Use helper: csc.exe (.NET Framework 4.x) was not found');

  const refs = [];
  for (const name of GAC_REFS) {
    const found = findGacAssembly(name);
    if (found === null) throw new Error('cannot build the Computer Use helper: reference assembly ' + name + ' is missing from the GAC');
    refs.push('/r:' + found);
  }

  fs.mkdirSync(path.dirname(exe), { recursive: true });
  log?.('[dsh-computer-use] compiling helper with ' + compiler);
  const compile = output => execFileSync(compiler, ['/nologo', '/target:exe', '/platform:anycpu', '/out:' + output, ...SOURCES, ...refs], { encoding: 'utf8', windowsHide: true });
  try {
    compile(exe);
    if (!fs.existsSync(exe)) throw new Error('helper compilation produced no executable');
    return { exe, built: true };
  } catch (error) {
    // Windows locks a running exe. Compile alongside it during an update rather
    // than stopping a helper owned by another DSH session.
    if (!fs.existsSync(exe) || !String(error.stdout ?? '').includes('CS0016')) throw error;
    const hash = createHash('sha256');
    for (const source of SOURCES) hash.update(fs.readFileSync(source));
    const cached = path.join(path.dirname(exe), path.basename(exe, '.exe') + '-' + hash.digest('hex').slice(0, 16) + '.exe');
    if (isHelperFresh(cached)) return { exe: cached, built: false };
    log?.('[dsh-computer-use] helper is in use; compiling alongside it');
    compile(cached);
    return { exe: cached, built: true };
  }
}

/** The in-use indicator (breathing frame + virtual cursor) is a separate win-exe. */
export function isOverlayFresh(exe = OVERLAY_EXE) {
  if (!fs.existsSync(exe)) return false;
  const exeTime = fs.statSync(exe).mtimeMs;
  return OVERLAY_SOURCES.every(source => fs.existsSync(source) && fs.statSync(source).mtimeMs <= exeTime);
}

export function ensureOverlay({ force = false, exe = OVERLAY_EXE, log } = {}) {
  if (!force && isOverlayFresh(exe)) return { exe, built: false };
  if (process.platform !== 'win32') return { exe, built: false, reason: 'not-windows' };
  const compiler = findCompiler();
  if (compiler === null) throw new Error('cannot build the Computer Use overlay: csc.exe (.NET Framework 4.x) was not found');

  fs.mkdirSync(path.dirname(exe), { recursive: true });
  const args = ['/nologo', '/target:winexe', '/platform:anycpu', '/out:' + exe, ...OVERLAY_SOURCES,
    '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll'];
  log?.('[dsh-computer-use] compiling overlay with ' + compiler);
  const output = execFileSync(compiler, args, { encoding: 'utf8', windowsHide: true });
  if (!fs.existsSync(exe)) throw new Error('overlay compilation produced no executable: ' + output);
  return { exe, built: true };
}
