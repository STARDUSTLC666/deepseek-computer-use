/**
 * Build the optional native helpers:
 *   capture/  Windows.Graphics.Capture tool (net48 + SharpDX)
 *   audio/    WASAPI loopback recorder (net48 + NAudio)
 *
 * Both target .NET Framework 4.8 - no runtime for the user to install - but they
 * do need the .NET SDK to compile (NuGet restore). When dotnet is missing the
 * plugin still works: capture falls back to PrintWindow and audio reports
 * `audio_missing`.
 *
 * @module @stardustlc666/dsh-computer-use-windows/build-native
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BIN_DIR, PLUGIN_ROOT } from './build-helper.mjs';

const PROJECTS = [
  { name: 'capture', csproj: path.join(PLUGIN_ROOT, 'native', 'wgcfw', 'Capture.csproj'), output: path.join(BIN_DIR, 'capture'), exe: 'dsh-cu-capture.exe' },
  { name: 'audio', csproj: path.join(PLUGIN_ROOT, 'native', 'audio', 'Audio.csproj'), output: path.join(BIN_DIR, 'audio'), exe: 'dsh-cu-audio.exe' },
];

function hasDotnet() {
  try { execFileSync('dotnet', ['--version'], { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
}

export function buildNative({ log } = {}) {
  if (!hasDotnet()) {
    log?.('[dsh-computer-use] .NET SDK not found: skipping capture/audio (fallbacks stay active)');
    return { built: [], skipped: PROJECTS.map(p => p.name) };
  }
  const built = [];
  const skipped = [];
  for (const project of PROJECTS) {
    if (!fs.existsSync(project.csproj)) { skipped.push(project.name); continue; }
    try {
      log?.('[dsh-computer-use] building native/' + project.name);
      execFileSync('dotnet', ['build', project.csproj, '-c', 'Release', '-v', 'q', '--nologo'], { stdio: 'inherit', windowsHide: true });
      const produced = path.join(path.dirname(project.csproj), 'bin', 'Release', 'net48');
      fs.mkdirSync(project.output, { recursive: true });
      for (const file of fs.readdirSync(produced)) {
        if (!file.endsWith('.pdb')) fs.copyFileSync(path.join(produced, file), path.join(project.output, file));
      }
      if (fs.existsSync(path.join(project.output, project.exe))) built.push(project.name);
      else skipped.push(project.name);
    } catch (error) {
      log?.('[dsh-computer-use] ' + project.name + ' build failed: ' + error.message);
      skipped.push(project.name);
    }
  }
  return { built, skipped };
}
