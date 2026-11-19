import path from 'node:path';

export function buildCleanWin32Env(extraEnv = {}, baseEnv = process.env) {
  const env = {};
  const names = new Map();
  const blocked = new Set(['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', 'NODE_OPTIONS', 'VSCODE_INSPECTOR_OPTIONS']);
  const systemKeys = { SYSTEMROOT: 'SystemRoot', WINDIR: 'WINDIR', COMSPEC: 'COMSPEC' };
  for (const [name, value] of [...Object.entries(baseEnv), ...Object.entries(extraEnv)]) {
    const upper = name.toUpperCase();
    if (blocked.has(upper)) continue;
    const key = systemKeys[upper] ?? names.get(upper) ?? name;
    names.set(upper, key);
    env[key] = value;
  }
  env.SystemRoot ||= env.WINDIR || 'C:\Windows';
  env.WINDIR ||= env.SystemRoot;
  env.COMSPEC ||= path.win32.join(env.SystemRoot, 'System32', 'cmd.exe');
  return env;
}

export const PROTOCOL_VERSION = 3;
