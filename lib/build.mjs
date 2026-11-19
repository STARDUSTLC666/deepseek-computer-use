#!/usr/bin/env node
/**
 * Build every native piece this plugin uses:
 *   helper   UIA / SendInput / capture dispatch   (csc, always available)
 *   overlay  in-use indicator                     (csc, always available)
 *   capture  Windows.Graphics.Capture             (needs .NET SDK)
 *   audio    WASAPI loopback recorder             (needs .NET SDK)
 */
import { ensurePrepared } from './build-helper.mjs';
import { buildNative } from './build-native.mjs';

const log = message => console.log(message);

const helper = await ensurePrepared({ log });
log('[dsh-computer-use] helper ' + (helper.built ? 'built' : 'up to date') + ' -> ' + helper.helperPath);
log('[dsh-computer-use] overlay -> ' + helper.overlayPath);

const native = buildNative({ log });
log('[dsh-computer-use] capture/audio built: ' + (native.built.join(', ') || 'none') +
    (native.skipped.length > 0 ? ' | skipped: ' + native.skipped.join(', ') : ''));
