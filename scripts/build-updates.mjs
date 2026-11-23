import { wrapClient } from '@stardustlc/dsh-updates/build';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import cssModules from 'postcss-modules';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const name = 'deepseek-computer-use';
const sourcePath = new URL('ui/ConsoleWorkbench.js', root);
const cssPath = new URL('ui/ConsoleWorkbench.module.css', root);
const [source, original, manifest, clsx, icon] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(require.resolve('clsx'), 'utf8'),
  readFile(new URL('assets/plugin-icon.webp', root), 'base64'),
]);
let names;
const { css } = await postcss([cssModules({
  generateScopedName: 'dsh-cu__[local]',
  getJSON: (_file, map) => { names = map; },
})]).process(original, { from: fileURLToPath(cssPath) });

const entry = `window.__ModuleLoader__.load({
  id: 'deepseek-computer-use',
  factory(require) {
    const React = require('react');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const clsx = (() => {
      const module = { exports: {} };
      __CLSX_SOURCE__
      return module.exports;
    })();
    __WORKBENCH_SOURCE__
    const ConsoleWorkbench = createConsoleWorkbench(React, primitives, clsx, __WORKBENCH_STYLES__, __WORKBENCH_CSS__, __VERSION__);
    return {
      inject: ['slots'],
      apply(ctx) {
        const label = () => String(ctx.get?.('locale')?.getSnapshot?.().active ?? document.documentElement.lang).startsWith('en')
          ? 'Computer Use' : '电脑操作';
        const watchTheme = listener => ctx.on('theme/change', listener);
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'deepseek-computer-use',
          inject: () => ({ locale: ctx.get?.('locale'), theme: ctx.get?.('theme'), watchTheme }) }, ConsoleWorkbench));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: 'deepseek-computer-use', order: 56, label: label }, function ComputerUseIcon({ size = 16 }) {
          return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', 'aria-hidden': true },
          React.createElement('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2.5 }),
          React.createElement('path', { d: 'M8 21h8m-4-4v4' }), React.createElement('circle', { cx: 12, cy: 10, r: 2.5 }));
        }));
      },
    };
  },
});`
  .replace('__CLSX_SOURCE__', () => clsx)
  .replace('__WORKBENCH_SOURCE__', () => source)
  .replace('__WORKBENCH_STYLES__', () => JSON.stringify(names))
  .replace('__WORKBENCH_CSS__', () => JSON.stringify(css))
  .replace('__VERSION__', () => JSON.stringify(manifest.version));

const output = wrapClient(entry, name, manifest.version, 'data:image/webp;base64,' + icon);
await writeFile(new URL('lib/update-client.js', root), output);
