// Generated: shared optional update controls; edit the original client templates.
(function(){
/* DSH workbench UI v1. MIT. Canonical source: dsh-suite/ui/workbench-ui.js.
 * Vendored into each plugin: no Suite or extra runtime dependency is required.
 * Styles are scoped to .dshw and never replace the host chrome or theme.
 */
function createWorkbenchUI(React) {
  const h = React.createElement;
  const { useEffect, useId, useRef } = React;
  const cx = (...values) => values.filter(Boolean).join(' ');
  const paths = {
    book: ['M4 4h6a3 3 0 0 1 2 2v15a4 4 0 0 0-4-2H4z', 'M20 4h-6a3 3 0 0 0-2 2v15a4 4 0 0 1 4-2h4z'],
    calendar: ['M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z', 'M7 3v4M17 3v4M3 10h18'],
    mail: ['M3 5h18v14H3z', 'm3 6 9 7 9-7'],
    rss: ['M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16', 'M4 19h.01'],
    slides: ['M3 4h18v13H3z', 'M12 17v4M8 21h8'],
    shield: ['m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z', 'm8 12 3 3 5-6'],
    layers: ['M5 3h16v16H5z', 'M2 7v15h15'],
    play: ['m9 6 9 6-9 6Z'],
    video: ['M3 5h12v14H3z', 'm15 10 6-4v12l-6-4'],
    search: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z', 'm16 16 5 5'],
    plus: ['M12 5v14M5 12h14'],
    refresh: ['M20 7a9 9 0 1 0 1 8', 'M20 2v5h-5'],
    settings: ['m9 3-.7 2.4-2 .9L4 5.8 2.5 8.4l1.7 1.8v2.3L2.5 14 4 17l2.5-.4 1.9 1L9 20h3l.8-2.4 2-1 2.5.4 1.5-2.7-1.7-1.9v-2.2l1.7-1.8-1.5-2.6-2.5.4-2-1L12 3Z', 'M14 11.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z'],
    close: ['m6 6 12 12M18 6 6 18'],
    left: ['m14 5-7 7 7 7'],
    right: ['m10 5 7 7-7 7'],
    down: ['m5 9 7 7 7-7'],
    filter: ['M4 5h16M7 12h10M10 19h4'],
    download: ['M12 3v12m-5-5 5 5 5-5', 'M4 16v5h16v-5'],
    upload: ['M12 16V4m-5 5 5-5 5 5', 'M4 16v5h16v-5'],
    copy: ['M8 8h13v13H8z', 'M16 8V3H3v13h5'],
    external: ['M14 3h7v7m0-7L10 14', 'M10 3H3v18h18v-7'],
    file: ['M4 3h10l6 6v12H4z', 'M14 3v6h6M8 13h8M8 17h6'],
    folder: ['M3 5h7l2 3h9v12H3z'],
    edit: ['m15 4 5 5-10 10-6 1 1-6Z', 'm13 6 5 5'],
    trash: ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
    more: ['M5 12h.01M12 12h.01M19 12h.01'],
    info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11v6M12 7h.01'],
    check: ['m5 12 4 4L19 6'],
    quote: ['M4 12h6v7H3v-7c0-4 2-6 5-7M15 12h6v7h-7v-7c0-4 2-6 5-7'],
    star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z'],
    reply: ['m9 5-7 7 7 7v-5h6c3 0 5 2 6 5 0-8-4-11-12-11Z'],
    link: ['m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0', 'm14 8 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
  };
  function Icon({ name = 'file', size = 20, ...props }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false, ...props },
      (paths[name] || paths.file).map((d, index) => h('path', { key: index, d })));
  }
  function Button({ children, icon, variant, className, ...props }) {
    return h('button', { type: 'button', ...props, className: cx('w-button', variant && 'w-' + variant, className) }, icon ? h(Icon, { name: icon, size: 18 }) : null, children);
  }
  function IconButton({ label, icon, ...props }) {
    return h(Button, { ...props, icon, className: cx('w-icon-button', props.className), 'aria-label': label, title: label });
  }
  function Page({ title, subtitle, actions, children, workbench = false, className, rootRef, ...props }) {
    return h('section', { ...props, ref: rootRef, className: cx('dshw', 'w-page', className), 'data-main': workbench ? 'true' : 'false' },
      h(Styles, { key: 'styles' }),
      h('header', { className: 'w-page-header' }, h('div', { className: 'w-heading' }, h('h1', null, title), subtitle ? h('p', { className: 'w-subtitle' }, subtitle) : null), actions ? h('div', { className: 'w-header-actions' }, actions) : null),
      h('div', { className: 'w-body' }, children));
  }
  function Tabs({ items, value, onChange, label, children }) {
    const id = useId();
    const active = items.some(item => item.id === value) ? value : items[0]?.id;
    function keys(event, index) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      const node = event.currentTarget.parentElement?.querySelectorAll('[role=tab]')[next];
      if (node) { onChange(items[next].id); node.focus(); }
    }
    return h('div', { className: 'w-tabs-layout' },
      h('div', { className: 'w-tabs', role: 'tablist', 'aria-label': label }, items.map((item, index) => h('button', {
        type: 'button', role: 'tab', key: item.id, id: id + '-' + item.id, 'aria-controls': id + '-panel', 'aria-selected': active === item.id, tabIndex: active === item.id ? 0 : -1,
        onClick: () => onChange(item.id), onKeyDown: event => keys(event, index),
      }, item.label, item.count !== undefined ? h('span', { className: 'w-count' }, item.count) : null))),
      h('div', { className: 'w-tab-panel', id: id + '-panel', role: 'tabpanel', 'aria-labelledby': id + '-' + active }, children));
  }
  function Status({ children, tone = 'info', className }) {
    if (!children) return null;
    return h('div', { className: cx('dshw', 'w-status', 'w-status-' + tone, className), role: tone === 'error' ? 'alert' : 'status', 'aria-live': tone === 'error' ? 'assertive' : 'polite' }, h(Icon, { name: tone === 'success' ? 'check' : 'info', size: 18 }), h('div', null, children));
  }
  function Empty({ title, children, action, icon = 'file' }) {
    return h('div', { className: 'dshw w-empty' }, h(Styles, { key: 'styles' }), h(Icon, { name: icon, size: 32 }), h('h2', null, title), children ? h('div', { className: 'w-muted' }, children) : null, action ? h('div', { className: 'w-toolbar' }, action) : null);
  }
  function Split({ list, detail, selected, onBack, backLabel, className, listWidth = 360 }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!selected || !ref.current || ref.current.clientWidth > 760) return;
      const heading = ref.current.querySelector('.w-detail h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }, [selected]);
    return h('div', { ref, className: cx('w-split', className), 'data-selected': selected ? 'true' : 'false', style: { '--w-list-width': listWidth + 'px' } },
      h('div', { className: 'w-master' }, list),
      h('div', { className: 'w-detail' }, selected ? h(Button, { className: 'w-back', icon: 'left', variant: 'ghost', onClick: onBack }, backLabel) : null, detail));
  }
  function Row({ title, meta, description, active, onClick, children, status, className, disabled }) {
    return h('div', { className: cx('w-row', active && 'w-selected', className) },
      children ? h('div', { className: 'w-row-select' }, children) : null,
      h('button', { type: 'button', className: 'w-row-button', onClick, disabled, 'aria-pressed': !!active },
        h('span', { className: 'w-row-head' }, h('strong', null, title), status ? h('span', { className: 'w-tag' }, status) : null),
        meta ? h('span', { className: 'w-row-meta' }, meta) : null,
        description ? h('span', { className: 'w-row-description' }, description) : null));
  }
  function Search({ label, value, onChange, ...props }) {
    const id = useId();
    return h('div', { className: 'w-search' }, h(Icon, { name: 'search', size: 18 }), h('input', { type: 'search', id, 'aria-label': label, placeholder: label, value, onChange, ...props }));
  }
  function Switch({ label, checked, onChange, disabled }) {
    return h('label', { className: 'w-switch-label' }, h('span', null, label), h('input', { type: 'checkbox', role: 'switch', checked, disabled, onChange, 'aria-label': label }), h('span', { className: 'w-switch-track', 'aria-hidden': true }));
  }
  function Dialog({ title, children, onClose, closeLabel, className, busy = false }) {
    const id = useId(), panel = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      panel.current?.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')?.focus();
      return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, []);
    function keydown(event) {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!controls.length) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return h('div', { className: 'dshw w-overlay', onClick: event => { if (!busy && event.target === event.currentTarget) onClose(); } },
      h(Styles, { key: 'styles' }),
      h('section', { ref: panel, className: cx('w-dialog', className), role: 'dialog', 'aria-modal': true, 'aria-labelledby': id, tabIndex: -1, onKeyDown: keydown },
        h('header', { className: 'w-dialog-header' }, h('h2', { id }, title), h(IconButton, { icon: 'close', label: closeLabel, disabled: busy, onClick: onClose })), h('div', { className: 'w-dialog-body' }, children)));
  }
  function register(ctx, { id, label, icon, component, inject, order = 50 }) {
    // The two slots are optional. Existing settings and manual tools still load
    // in hosts without a workbench, while RC.3 owns navigation/pinning itself.
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, inject: () => ({ ...(inject?.() || {}), workbench: true }) }, component));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order, label }, function WorkbenchIcon({ size }) { return h(Icon, { name: icon, size }); }));
  }
  const styles = `
.dshw{--w-bg:var(--dsw-alias-bg-layer-1,#fff);--w-soft:var(--dsw-alias-bg-layer-2,#f7f8fa);--w-text:var(--dsw-alias-label-primary,#18202c);--w-muted:var(--dsw-alias-label-secondary,#667085);--w-border:var(--dsw-alias-border-l3,#e7e9ef);--w-accent:var(--dsh-plugin-workbench-accent,#4f6bdb);--w-selected:color-mix(in srgb,var(--w-accent) 10%,var(--w-bg));--w-primary:var(--w-text);--w-on-primary:var(--w-bg);container-type:inline-size;container-name:dsh-workbench;color:var(--w-text);font:14px/1.65 var(--dsh-font-family-content,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif);min-width:0;max-width:100%;box-sizing:border-box;text-align:start;color-scheme:inherit}
.dshw *,.dshw *:before,.dshw *:after{box-sizing:border-box}.dshw h1,.dshw h2,.dshw h3,.dshw h4,.dshw p{margin:0}.dshw h1{font-size:30px;line-height:1.25;letter-spacing:-.025em;font-weight:650}.dshw h2{font-size:24px;line-height:1.35;font-weight:650;letter-spacing:-.015em;overflow-wrap:anywhere}.dshw h3,.dshw h4{font-size:16px;line-height:1.4;font-weight:600}.dshw a{color:var(--w-accent);text-underline-offset:3px;overflow-wrap:anywhere}.dshw button,.dshw input,.dshw select,.dshw textarea{font:inherit;color:inherit;max-width:100%}.dshw input:not([type=checkbox]):not([type=radio]):not([type=file]),.dshw select,.dshw textarea{background:var(--dsw-specific-input-major,var(--w-bg));border:1px solid var(--w-border);border-radius:8px;padding:8px 11px;min-width:0;line-height:1.5}.dshw input:not([type=checkbox]):not([type=radio]):not([type=file]),.dshw select{min-height:38px}.dshw textarea{resize:vertical}.dshw input[type=checkbox],.dshw input[type=radio]{width:16px;height:16px;flex-shrink:0;accent-color:var(--w-accent)}.dshw :focus-visible{outline:2px solid var(--w-accent);outline-offset:3px}.dshw button:disabled,.dshw input:disabled,.dshw select:disabled,.dshw textarea:disabled{opacity:.5;cursor:not-allowed}.dshw label{font-size:13px}.dshw fieldset{min-width:0;border:1px solid var(--w-border);border-radius:8px}.dshw summary{cursor:pointer;font-weight:550;list-style:none;display:flex;align-items:center;gap:8px}.dshw summary::-webkit-details-marker{display:none}.dshw summary:after{content:'';display:block;margin-inline-start:auto;width:7px;height:7px;border-inline-end:1.75px solid currentColor;border-bottom:1.75px solid currentColor;transform:rotate(45deg);flex-shrink:0}.dshw details[open]>summary:after{transform:rotate(225deg)}.dshw details>summary+*{margin-top:12px}.dshw pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;max-width:100%;background:var(--w-soft);border-radius:6px;padding:14px}.dshw img,.dshw video,.dshw iframe{max-width:100%}
.w-page{display:flex;flex-direction:column;position:relative;padding:0;min-height:540px;gap:0}.w-page[data-main=true]{height:100%;min-height:0;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 28px 0 max(28px,var(--dsh-frame-leading-clearance,0px));overflow:auto}.dshw[data-main=true]{background:var(--w-bg)}.dshw.w-page,.dshw .w-body,.dshw .w-tab-panel{overflow-x:clip}.w-page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:22px;flex-shrink:0}.w-heading{min-width:0}.w-subtitle{margin-top:8px!important;font-size:14px;color:var(--w-muted);line-height:1.6}.w-header-actions,.w-toolbar,.w-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.w-header-actions{justify-content:flex-end}.w-body,.w-tabs-layout{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.w-body{overflow:auto}.w-tab-panel{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:auto}.w-tabs{display:flex;align-items:stretch;gap:20px;border-bottom:1px solid var(--w-border);flex-shrink:0;overflow-x:auto;scrollbar-width:thin}.dshw .w-tabs>button{border:0;border-bottom:2px solid transparent;background:transparent;padding:11px 8px 13px;white-space:nowrap;font-size:14px;font-weight:550;cursor:pointer;color:var(--w-muted);display:flex;align-items:center;gap:7px}.dshw .w-tabs>button[aria-selected=true]{border-bottom-color:var(--w-accent);color:var(--w-accent)}.w-count,.w-tag{font-size:12px;line-height:1.5;display:inline-flex;align-items:center;flex-shrink:0;background:var(--w-soft);border-radius:5px;padding:1px 6px;color:var(--w-muted)}.w-tabs [aria-selected=true] .w-count,.w-selected .w-tag{color:var(--w-accent);background:var(--w-selected)}
.dshw .w-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;background:var(--w-bg);border:1px solid var(--w-border);border-radius:8px;padding:8px 12px;min-height:36px;line-height:1.4;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;white-space:normal}.dshw .w-button:not(:disabled):hover{background:var(--w-soft)}.dshw .w-primary{background:var(--w-primary);border-color:var(--w-primary);color:var(--w-on-primary)}.dshw .w-primary:not(:disabled):hover{background:var(--w-primary);opacity:.9}.dshw .w-ghost{background:transparent;border-color:transparent}.dshw .w-danger{color:var(--dsw-alias-state-error-primary,#b43c3c)}.dshw .w-icon-button{width:36px;min-width:36px;padding:8px}.dshw .w-button svg{flex-shrink:0}.w-muted{color:var(--w-muted);font-size:12px;line-height:1.6}.w-section{padding:24px 0;border-bottom:1px solid var(--w-border);min-width:0}.w-section>h3{margin-bottom:12px}.w-section>p+p{margin-top:8px}.w-fields{display:grid;gap:16px;min-width:0}.w-field{display:grid;gap:6px;min-width:0}.w-field>input,.w-field>select,.w-field>textarea{width:100%}.w-status{display:flex;align-items:flex-start;gap:8px;padding:11px 13px;margin:12px 0;border:1px solid var(--w-border);border-radius:8px;background:var(--w-soft);font-size:13px;overflow-wrap:anywhere;flex-shrink:0}.w-status>svg{flex-shrink:0;margin-top:2px}.w-status-error{color:var(--dsw-alias-state-error-primary,#ad3636)}.w-status-success{color:var(--dsw-alias-state-success-primary,#24794a)}.w-status-warn{color:var(--dsw-alias-state-warning-primary,#8a5a00)}.w-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;width:100%;max-width:580px;padding:48px 24px;margin:auto;min-height:280px;overflow-wrap:anywhere}.w-empty>svg{color:var(--w-muted)}.w-empty h2{font-size:20px}.w-empty .w-muted{font-size:14px}.w-empty .w-toolbar{justify-content:center}
.w-split{display:grid;grid-template-columns:minmax(240px,var(--w-list-width)) minmax(0,1fr);min-height:460px;flex:1;min-width:0}.w-master{min-width:0;border-inline-end:1px solid var(--w-border);overflow:auto;padding-bottom:24px}.w-detail{min-width:0;padding:26px 28px;overflow:auto;overflow-wrap:anywhere;display:flex;flex-direction:column}.w-master-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:20px 16px}.w-search{display:flex;align-items:center;gap:8px;border:1px solid var(--w-border);border-radius:8px;padding:0 10px;min-width:0;flex:1;background:var(--w-bg)}.w-search>svg{color:var(--w-muted);flex-shrink:0}.dshw .w-search>input{border:0!important;background:transparent!important;padding:8px 0!important;width:100%;outline-offset:0}.w-row{display:flex;gap:0;min-width:0;position:relative;border-bottom:1px solid var(--w-border);border-inline-start:3px solid transparent}.w-row-select{display:flex;align-items:flex-start;padding:21px 0 0 14px}.dshw .w-row-button{display:flex;flex-direction:column;align-items:stretch;gap:7px;text-align:start;width:100%;padding:18px 18px 18px 16px;border:0;background:transparent;color:inherit;min-width:0;cursor:pointer;line-height:1.5}.dshw .w-row-button:hover{background:var(--w-soft)}.w-row-head{display:flex;align-items:flex-start;gap:10px;justify-content:space-between;min-width:0}.w-row-head>strong{font-size:14px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}.w-row-meta,.w-row-description{color:var(--w-muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.w-row-description{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.w-selected{background:var(--w-selected);border-inline-start-color:var(--w-accent)}.w-back{display:none!important}.w-detail-title{margin-bottom:12px!important}.w-detail-meta{color:var(--w-muted);font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.w-detail-footer{padding:24px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:auto;border-top:1px solid var(--w-border)}.w-detail-footer .w-muted{flex:1;min-width:160px}.w-definition{display:grid;grid-template-columns:minmax(80px,120px) minmax(0,1fr);gap:8px 16px;font-size:14px;margin:20px 0}.w-definition dt{color:var(--w-muted)}.w-definition dd{margin:0;min-width:0;overflow-wrap:anywhere}
.w-switch-label{display:inline-flex;align-items:center;gap:8px;font-size:13px;position:relative;cursor:pointer}.w-switch-label>input{position:absolute;opacity:0;inset-inline-end:0;width:36px!important;height:22px!important;margin:0;cursor:pointer}.w-switch-track{width:36px;height:22px;border-radius:12px;display:block;background:var(--w-border);border:1px solid var(--w-border);pointer-events:none;padding:2px;transition:background .15s}.w-switch-track:before{content:'';display:block;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002;transition:transform .15s}.w-switch-label>input:checked+.w-switch-track{background:var(--w-accent);border-color:var(--w-accent)}.w-switch-label>input:checked+.w-switch-track:before{transform:translateX(14px)}.w-switch-label>input:focus-visible+.w-switch-track{outline:2px solid var(--w-accent);outline-offset:3px}.w-switch-label:has(>input:disabled){opacity:.5;cursor:not-allowed}
.w-overlay{position:fixed;inset:0;background:#0005;display:flex;justify-content:flex-end;z-index:1000;padding:12px;overflow:auto}.w-dialog{width:min(620px,100%);max-height:100%;display:flex;flex-direction:column;min-height:0;background:var(--w-bg);color:var(--w-text);border:1px solid var(--w-border);border-radius:12px;box-shadow:0 18px 70px #0003}.w-dialog-header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 24px;border-bottom:1px solid var(--w-border);flex-shrink:0}.w-dialog-header>h2{font-size:20px}.w-dialog-body{overflow:auto;padding:20px 24px;min-height:0}.w-editor-grid{display:grid;grid-template-columns:210px minmax(0,1fr) 300px;min-height:500px;flex:1}.w-editor-list{padding:20px 12px;border-inline-end:1px solid var(--w-border);min-width:0}.w-editor-canvas{background:var(--w-soft);padding:20px;min-width:0;display:flex;flex-direction:column;gap:14px}.w-editor-inspector{padding:24px;border-inline-start:1px solid var(--w-border);min-width:0;overflow:auto}.w-editor-inspector h3{margin-bottom:18px}.w-preview-empty{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:12px;aspect-ratio:16/9;min-height:180px;background:var(--w-soft);border:1px solid var(--w-border);border-radius:8px;padding:24px;color:var(--w-muted)}.w-content-pad{padding:24px 0}.w-stack{display:flex;flex-direction:column;gap:16px;min-width:0}.w-scroll-x{overflow:auto;max-width:100%}
@container dsh-workbench (max-width:1000px){.w-editor-grid{grid-template-columns:160px minmax(0,1fr)}.w-editor-inspector{grid-column:1/-1;border-inline-start:0;border-top:1px solid var(--w-border)}.w-header-actions{max-width:60%}.w-split{grid-template-columns:minmax(240px,32%) minmax(0,1fr)}}
@container dsh-workbench (max-width:760px){.w-page-header{gap:14px;flex-wrap:wrap;padding-bottom:18px}.w-heading{flex:1;min-width:170px}.dshw h1{font-size:24px}.w-header-actions{max-width:100%;justify-content:flex-start}.w-subtitle{font-size:13px}.w-tabs{gap:12px}.dshw .w-tabs>button{padding:10px 4px 12px}.w-split{display:block;min-height:360px}.w-split[data-selected=false]>.w-detail{display:none}.w-split[data-selected=true]>.w-master{display:none}.w-master{border-inline-end:0}.w-detail{padding:20px 0}.w-back{display:inline-flex!important;align-self:flex-start;margin:0 0 16px!important}.w-detail h2{font-size:22px}.w-master-toolbar{padding:16px 0}.dshw .w-row-button{padding:16px 10px}.w-detail-footer{position:static}.w-detail-footer .w-muted{flex-basis:100%}.w-editor-grid{display:flex;flex-direction:column}.w-editor-list{border-inline-end:0;border-bottom:1px solid var(--w-border);padding:16px 0}.w-editor-canvas{padding:16px 0;background:var(--w-bg)}.w-editor-inspector{padding:20px 0}.w-dialog-header,.w-dialog-body{padding:16px}.w-button{min-height:40px}.w-definition{grid-template-columns:80px minmax(0,1fr)}}
@media(max-width:700px){.w-page[data-main=true]{padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 16px 0 max(16px,var(--dsh-frame-leading-clearance,0px))}.w-overlay{padding:8px}.w-dialog{width:100%}}
@media(prefers-reduced-motion:reduce){.dshw *,.dshw *:before{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
  function Styles() { return h('style', null, styles); }
  return { Icon, Button, IconButton, Page, Tabs, Status, Empty, Split, Row, Search, Switch, Dialog, Styles, register, styles };
}

/* One update control per plugin. Only transport, idle guards and installation
 * coordination are shared; no global update page or update-all action exists. */
function __stardustUpdatesGuards() {
  const key = Symbol.for('stardustlc.plugin-updates.guards.v1');
  return globalThis[key] ||= { values: new Map(), listeners: new Set(), viewListeners: new Set(), clients: new Set() };
}
function __stardustUpdatesGuard(React, name, { dirty = false, busy = false, retainOnClose = false } = {}) {
  const token = React.useRef(null);
  if (!token.current) token.current = {};
  React.useLayoutEffect(() => {
    const pool = __stardustUpdatesGuards();
    if (!dirty && !busy) for (const [key, value] of pool.values) if (value.name === name && value.orphan) pool.values.delete(key);
    pool.values.set(token.current, { name, dirty: !!dirty, busy: !!busy, retainOnClose, orphan: false });
    for (const listener of pool.listeners) listener();
  }, [name, !!dirty, !!busy, retainOnClose]);
  React.useEffect(() => () => {
    const pool = __stardustUpdatesGuards(), value = pool.values.get(token.current);
    if (value?.retainOnClose && (value.dirty || value.busy)) value.orphan = true;
    else pool.values.delete(token.current);
    for (const listener of pool.listeners) listener();
  }, []);
}
function __StardustPluginUpdatesFooter({ React, name }) {
  const [, render] = React.useState(0), pool = __stardustUpdatesGuards();
  React.useEffect(() => { const fn = () => render(value => value + 1); pool.viewListeners.add(fn); return () => pool.viewListeners.delete(fn); }, []);
  const client = [...pool.clients].find(client => typeof client.Footer === 'function' && client.has(name));
  if (!client) return null;
  return React.createElement(client.Footer, { name });
}
function __stardustUpdatesInlinePage(React, element, name) {
  return React.cloneElement(element, null, element.props.children, React.createElement(__StardustPluginUpdatesFooter, { key: 'plugin-updates', React, name }));
}
function __stardustUpdatesDetailName(subject, rows) {
  if (!subject || !['bundle', 'row'].includes(subject.kind)) return null;
  if (subject.kind === 'row' && subject.pkg?.name === '@stardustlc/dsh-suite') {
    const component = rows.find(row => row.bundledBy === subject.pkg.name && (subject.row?.moduleName === row.name || subject.row?.moduleName?.startsWith(row.name + '/')));
    if (component) return component.name;
  }
  return rows.some(row => row.name === subject.pkg?.name) ? subject.pkg.name : null;
}
function __stardustUpdatesNativeFormState(document) {
  let dirty = false, busy = false;
  for (const scope of document.querySelectorAll('[data-plugin-detail],[data-plugin-row-detail]')) for (const button of scope.querySelectorAll('button')) {
    if (!button.getClientRects().length || button.closest('.plugin-updates-footer')) continue;
    const label = (button.getAttribute('aria-label') || button.textContent || '').trim();
    if (/^(?:正在保存|保存中|Saving)(?:[.…\s]|$)/i.test(label) || button.getAttribute('aria-busy') === 'true') busy = true;
    if (!button.disabled && button.getAttribute('aria-disabled') !== 'true' && /^(?:保存(?:更改|设置|配置)?|Save(?: changes| settings| configuration)?)(?:\s+(?:Ctrl|⌘|Enter|↵).*)?$/i.test(label)) dirty = true;
  }
  return { dirty, busy };
}
function __stardustUpdatesDisplayRows(next, known) {
  for (const row of next.rows) known.set(row.name, row);
  if (!['verifying', 'installing', 'cancelling', 'unknown', 'restore-failed'].includes(next.job?.state)) return next;
  const rows = [...next.rows];
  for (const row of known.values()) if ((row.name === next.job.name || row.bundledBy === next.job.name) && !rows.some(item => item.name === row.name)) rows.push({ ...row, updating: true });
  return { ...next, rows };
}
function __stardustUpdatesSuiteRows(next, participants) {
  // The official manager lists top-level dependencies, not Suite's transitive
  // components. Project active, build-identified clients for display only.
  // Installation and preferences still use the real Suite row from the host.
  const suite = next.rows.find(row => row.name === '@stardustlc/dsh-suite' && row.enabled);
  if (!suite) return next;
  const rows = [...next.rows], names = new Set(rows.map(row => row.name));
  for (const item of participants) if (item.suiteComponent && item.packageVersion && item.label && !names.has(item.name)) {
    names.add(item.name);
    rows.push({ name: item.name, version: item.packageVersion, enabled: true, sourceKind: 'suite', loadError: false, label: item.label, labelEn: item.labelEn, bundledBy: suite.name });
  }
  return { ...next, rows };
}
function __stardustUpdatesWrap(definition, participant) {
  return { ...definition, factory(require) {
    const original = definition.factory(require);
    if (!original || typeof original !== 'object') return original;
    const React = require('react');
    return { ...original, apply(ctx, ...args) {
      const result = original.apply?.call(this, ctx, ...args);
      // The optional alpha.3 slot stays dormant in older hosts; its scoped
      // injection unregisters naturally when the plugin is unloaded.
      if (participant.iconData && participant.sectionIds?.length && typeof ctx.inject === 'function') ctx.inject(['slots'], host => {
        for (const id of new Set(participant.sectionIds)) host.slots.inject('settings.section.icon', () => host.slots.register({ name: 'settings.section.icon', id }, function PluginSettingsIcon({ size = 20 }) {
          return React.createElement('img', { src: participant.iconData, alt: '', 'aria-hidden': true, width: size, height: size, style: { objectFit: 'contain', display: 'block', flexShrink: 0 } });
        }));
      });
      if (typeof ctx.inject === 'function') ctx.inject(['slots', 'locale', 'remote', 'remote.pluginManager'], host => __stardustUpdatesJoin(host, React, require, participant));
      return result;
    } };
  } };
}
function __stardustUpdatesJoin(host, React, require, participant) {
  const key = Symbol.for('stardustlc.plugin-updates.client.v1'), pools = globalThis[key] ||= new WeakMap(), root = host.root || host;
  if (typeof root.plugin !== 'function') return;
  let record = pools.get(root);
  if (!record) {
    record = { refs: new Map(), timer: null, version: participant.version, alive: true, hold: false, uiRevision: 2 };
    pools.set(root, record);
    __stardustUpdatesActivate(record, pools, root, React, require);
  } else if (record.uiRevision !== 2 && !record.migration) {
    // The first loaded participant may still own a pre-footer client. Keep
    // its references and draft guards, wait for any admitted install, then
    // replace that one client fiber instead of running two window heartbeats.
    const shared = record;
    record.migration = Promise.resolve().then(async () => {
      while (shared.alive && shared.hold) await new Promise(resolve => setTimeout(resolve, 500));
      if (!shared.alive || !shared.refs.size) return;
      await shared.fiber?.dispose?.();
      if (!shared.refs.size) return;
      shared.alive = true; shared.uiRevision = 2; pools.set(root, shared);
      __stardustUpdatesActivate(shared, pools, root, React, require);
    }).catch(() => { /* The original page remains usable if host disposal fails. */ });
  }
  clearTimeout(record.timer);
  const ref = {}; record.refs.set(ref, participant);
  host.effect(() => () => {
    record.refs.delete(ref);
    const stop = () => {
      if (record.refs.size || !record.alive) return;
      if (record.hold) { record.timer = setTimeout(stop, 1000); return; }
      record.alive = false; Promise.resolve(record.fiber?.dispose?.()).catch(() => {});
    };
    if (!record.refs.size) record.timer = setTimeout(stop, 1000);
  });
}
function __stardustUpdatesActivate(shared, pools, root, React, require) {
  shared.fiber = root.plugin({ name: 'stardustlc-plugin-updates-client', inject: ['slots', 'locale', 'remote', 'remote.pluginManager'], apply(ctx) {
    const client = __stardustUpdatesClient(ctx, React, require, shared);
    ctx.effect(() => () => { shared.alive = false; client.dispose(); if (pools.get(root) === shared) pools.delete(root); });
  } });
  Promise.resolve(shared.fiber).catch(() => { shared.alive = false; if (pools.get(root) === shared) pools.delete(root); });
}
function __stardustUpdatesClient(ctx, React, require, shared) {
  const h = React.createElement, W = createWorkbenchUI(React), route = new URL('api/stardustlc/plugin-updates', document.baseURI);
  const { useState, useEffect } = React, id = crypto.randomUUID(), listeners = new Set(), pool = __stardustUpdatesGuards(), requests = new Set(), notified = new Set(), knownRows = new Map();
  let alive = true, registered = false, state = null, lastInteraction = Date.now(), inPoll = false, manualOperation = false, legacyHint = null;
  const language = () => String(ctx.locale?.getSnapshot?.().active || '').startsWith('en') ? 'en' : 'zh';
  const t = (zh, en) => language() === 'en' ? en : zh;
  const preferences = name => state?.preferences.packages[name] || { checkEnabled: true, autoInstall: false, deferredUntil: 0, ignoredVersion: null };
  const originalRow = name => state?.rows.find(row => row.name === name);
  const rowFor = name => { const row = originalRow(name); return row?.bundledBy ? originalRow(row.bundledBy) : row; };
  const activeJob = () => ['verifying', 'installing', 'cancelling'].includes(state?.job?.state);
  function notify() { shared.hold = manualOperation || activeJob(); for (const listener of listeners) listener(); for (const listener of pool.viewListeners) listener(); }
  async function api(body = { action: 'state' }) {
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), body.action === 'check' ? 95000 : 45000);
    try {
      const response = await fetch(route, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-stardustlc-updates': '1' }, body: JSON.stringify(body) });
      let data; try { data = await response.json(); } catch { throw new Error('service-unavailable'); }
      if (!response.ok || !data.ok) throw new Error(response.status === 403 ? 'owner-required' : data.code || 'service-unavailable');
      return data.value;
    } catch (error) { if (error?.name === 'AbortError') throw new Error('service-unavailable'); throw error; }
    finally { clearTimeout(timeout); requests.delete(controller); }
  }
  function pageState(manual = manualOperation) {
    const values = [...pool.values.values()], nativeForm = __stardustUpdatesNativeFormState(document);
    const dialog = [...document.querySelectorAll('[role="dialog"],dialog[open]')].some(node => node.getClientRects().length && !(manual && (node.closest('.plugin-updates-footer') || node.querySelector('.plugin-updates-footer'))));
    return { action: 'heartbeat', id, dirty: nativeForm.dirty || values.some(value => value.dirty), busy: nativeForm.busy || values.some(value => value.busy) || dialog, idleForMs: Math.min(86400000, Math.max(0, Date.now() - lastInteraction)) };
  }
  const heartbeat = () => api(pageState());
  function interaction() { lastInteraction = Date.now(); if (registered && alive) void heartbeat().catch(() => {}); }
  const guardChanged = () => { if (registered && alive) void heartbeat().catch(() => {}); };
  for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, interaction, { capture: true, passive: true });
  pool.listeners.add(guardChanged);
  const close = () => { void fetch(route, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json', 'x-stardustlc-updates': '1' }, body: JSON.stringify({ action: 'client-close', id }) }).catch(() => {}); };
  window.addEventListener('pagehide', close);
  async function refresh() { const next = await api(); if (alive) { state = __stardustUpdatesDisplayRows(__stardustUpdatesSuiteRows(next, shared.refs.values()), knownRows); notify(); } return next; }
  function useSnapshot() {
    const [, render] = useState(0);
    useEffect(() => { const fn = () => render(value => value + 1); listeners.add(fn); const stop = ctx.locale?.subscribe?.(fn); return () => { listeners.delete(fn); stop?.(); }; }, []);
    return state;
  }
  function message(code) {
    return ({
      'page-dirty': t('有未保存的修改。请先保存或放弃修改，再更新。', 'Save or discard unsaved changes before updating.'),
      'page-busy': t('有页面操作或对话框尚未结束，请完成后再试。', 'Finish the active page operation or close its dialog, then retry.'),
      'page-not-ready': t('还有窗口状态未确认，或旧版插件尚未提供状态保护。请刷新相关窗口，必要时先手动更新旧版插件。', 'A window state is unknown or an older plugin lacks state protection. Refresh the affected windows and manually update legacy plugins if needed.'),
      busy: t('DSH 正在执行任务或安装，请等操作结束。', 'DSH is running a task or installation. Wait for it to finish.'),
      'activity-unknown': t('无法确认任务是否空闲，已暂停安装。', 'Installation paused because task activity is unknown.'),
      'restart-required': t('更新服务需要重启后继续。请在方便时手动重启 DSH。', 'The updater needs a restart. Restart DSH manually when convenient.'),
      'operation-unconfirmed': t('上次安装未确认或恢复失败。请在官方插件管理中检查并修复，之后手动重启 DSH。', 'The last installation is unconfirmed or recovery failed. Check and repair it in native plugin management, then restart DSH manually.'),
      'check-first': t('检查结果已过期，请重新检查。', 'This check expired. Check again.'),
      'release-changed': t('发布信息已变化，本次未安装。请重新检查。', 'Release metadata changed. Nothing was installed; check again.'),
      'preferences-conflict': t('另一个窗口修改了偏好，已刷新，请重试。', 'Preferences changed in another window. They have been refreshed; retry.'),
      'preferences-unreadable': t('更新偏好文件无法读取，自动安装已关闭。请检查当前 profile 的 stardustlc-plugin-updates.json。', 'Preferences could not be read. Automatic installation is off. Check stardustlc-plugin-updates.json in this profile.'),
      'no-update': t('版本已变化或暂不兼容，请重新检查。', 'The version changed or is incompatible. Check again.'),
      'source-not-registry': t('本地源码、Git 等安装，请通过原安装方式更新。', 'Update local, Git and other external sources through their original installation method.'),
      'managed-by-suite': t('这个插件随 Suite 安装，通过 Suite 更新。', 'This plugin was installed through Suite and is updated through Suite.'),
      'owner-required': t('只有 profile 拥有者能管理更新。', 'Only the profile owner can manage updates.'),
    })[code] || t('操作未完成，请刷新后重试。DSH 不会因此自动重启。', 'The operation could not be completed. Refresh and retry. DSH will not restart automatically.');
  }
  // releaseOf() keeps the failing engine/peer range check as a stable code; say which
  // environment has to change instead of only reporting that the release is incompatible.
  function requirement(release) {
    return ({
      'dsh-version': t('需要换成与该版本匹配的 DSH 本体', 'it needs a different DSH version'),
      'node-version': t('需要换成与该版本匹配的 Node.js', 'it needs a different Node.js version'),
      deprecated: t('作者已把这个版本标记为弃用', 'the author marked this release as deprecated'),
      'not-bundle': t('这个版本不是可加载的 DSH 插件包', 'this release is not a loadable DSH plugin bundle'),
    })[release?.reason] || t('发布元数据的兼容范围与当前环境不符', 'its published compatibility range does not match this environment');
  }
  function jobLabel(job) {
    return ({ verifying: t('正在核对版本', 'Verifying release'), installing: t('正在安装', 'Installing'), cancelling: t('正在请求取消', 'Requesting cancellation'), complete: t('已更新', 'Updated'), 'restart-required': t('已安装，等待你手动重启', 'Installed; manual restart needed'), restored: t('更新未成功，已恢复原版本', 'Update failed; previous version restored'), 'restore-failed': t('恢复未成功，请检查官方插件管理', 'Recovery failed; check native plugin management'), unknown: t('结果未确认，请检查官方插件管理', 'Result unconfirmed; check native plugin management'), cancelled: t('已取消', 'Cancelled'), failed: t('更新未成功', 'Update failed') })[job.state] || job.state;
  }
  function FooterFrame({ name, label, subtitle, actions, children }) {
    return h('section', { className: 'dshw plugin-updates-footer', 'data-plugin-update-footer': name, 'aria-label': label + t(' · 版本与更新', ' · Version and updates') },
      h('style', null, W.styles),
      h('style', null, '.plugin-updates-footer{box-sizing:border-box;flex-shrink:0;margin-top:28px;padding-top:18px;border-top:1px solid var(--dsw-alias-border-l3,#e5e7eb);min-width:0;max-width:100%;color:var(--dsw-alias-label-primary,#202124)}.plugin-updates-footer .updates-head{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px}.plugin-updates-footer h2{font-size:14px;line-height:22px;margin:0;font-weight:600}.plugin-updates-footer .updates-subtitle,.plugin-updates-footer .updates-version{font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere;margin:4px 0}.plugin-updates-footer .updates-options{margin-top:12px}.plugin-updates-footer .updates-options>summary{cursor:pointer;font-size:12px;line-height:22px;color:var(--dsw-alias-label-secondary,#657080)}.plugin-updates-footer .updates-options>summary:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#6b79df);outline-offset:4px}.plugin-updates-footer .updates-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;padding:14px 0 0}.plugin-updates-footer .updates-note{margin:5px 0 0;font-size:12px;line-height:1.6}.plugin-updates-footer>.w-section{margin:10px 0 0;padding:0;border:0}.plugin-updates-footer .w-toolbar{margin-top:10px!important}.plugin-updates-footer .w-switch-label{max-width:100%;gap:12px;align-items:flex-start}.plugin-updates-footer .w-switch-track{flex-shrink:0}.plugin-updates-footer .updates-notes{margin-top:12px;padding:12px;border:1px solid var(--dsw-alias-border-l3,#e5e7eb);border-radius:10px}.plugin-updates-footer .updates-notes pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font:12px/1.7 ui-monospace,monospace}.plugin-updates-footer .w-overlay{z-index:1002}@media(max-width:600px){.plugin-updates-footer .updates-head{gap:8px}.plugin-updates-footer .w-toolbar{gap:6px;flex-wrap:wrap}.plugin-updates-footer .w-button{max-width:100%}}'),
      h('div', { className: 'updates-head' }, h('div', null, h('h2', null, t('版本与更新', 'Version and updates')), h('p', { className: 'updates-subtitle w-muted' }, subtitle)), actions), children);
  }
  function Panel({ name }) {
    const snapshot = useSnapshot(), [error, setError] = useState(''), [working, setWorking] = useState(false), [checking, setChecking] = useState(false), [dialog, setDialog] = useState(null), [notes, setNotes] = useState(null), [notesOpen, setNotesOpen] = useState(false), [loadingNotes, setLoadingNotes] = useState(false);
    const row = rowFor(name), original = originalRow(name), target = row?.name || name, prefs = preferences(target), job = snapshot?.job?.name === target ? snapshot.job : null;
    async function perform(callback) { setError(''); setWorking(true); try { await callback(); await refresh(); } catch (error) { setError(error.message); await refresh().catch(() => {}); } finally { setWorking(false); } }
    async function save(changes, consent) { await api({ action: 'preferences', name: target, revision: state.preferences.revision, changes, consent }); }
    async function check() { setError(''); setChecking(true); try { await api({ action: 'check', name: target }); await refresh(); } catch (error) { setError(error.message); } finally { setChecking(false); } }
    async function install() {
      setDialog(null); manualOperation = true; notify();
      await perform(async () => {
        try {
          await heartbeat();
          const started = await api({ action: 'install', name: row.name, version: row.release.version, confirmation: 'update-installed-plugin' });
          while (alive) {
            await new Promise(resolve => setTimeout(resolve, 800)); await heartbeat(); await refresh();
            if (state.job?.id !== started.id) throw new Error('operation-unconfirmed');
            if (!activeJob()) break;
          }
        } finally { manualOperation = false; notify(); }
      });
    }
    async function showNotes() {
      if (notesOpen) { setNotesOpen(false); return; }
      setNotesOpen(true); setNotes(null); setLoadingNotes(true); setError('');
      try { setNotes(await api({ action: 'notes', name: target, version: row.release.version })); } catch (error) { setError(error.message); } finally { setLoadingNotes(false); }
    }
    if (!snapshot || !row) return h(W.Status, null, t('此插件尚未安装或已从当前 profile 移除。', 'This plugin is not installed in the current profile.'));
    const title = language() === 'en' ? original.labelEn : original.label;
    const ownPage = pageState(true), unconfirmed = ['unknown', 'restore-failed'].includes(snapshot.job?.state), pageBusy = ownPage.busy || (snapshot.pages.clients || []).some(client => client.id !== id && client.busy), installLocked = working || activeJob() || unconfirmed || snapshot.updaterRestart || snapshot.preferenceError || !snapshot.activity.known || snapshot.activity.busy || snapshot.pages.dirty || ownPage.dirty || pageBusy || !snapshot.pages.known;
    const checkingThis = checking || snapshot.checkingNames?.includes(target);
    const status = row.sourceKind !== 'registry' ? t('本地 / 外部来源，保留原安装方式', 'Local / external source; keep original install method') : row.loadError ? t('加载异常，请先检查官方插件管理', 'Loading error; check native plugin management') : row.error ? t('检查失败，可以重试', 'Check failed; retry available') : row.release && !row.release.compatible ? t('新版本暂不兼容当前环境：', 'Latest release is incompatible with this environment: ') + requirement(row.release) : row.available ? (prefs.ignoredVersion === row.release.version ? t('已忽略提醒，仍可手动更新', 'Reminder ignored; manual update available') : t('有新版本', 'Update available')) : row.checkedAt ? t('当前已是最新稳定版', 'Latest stable version') : t('尚未检查', 'Not checked yet');
    return h(FooterFrame, { name, label: title, subtitle: original.name + ' · ' + original.version, actions: h(W.Button, { icon: 'refresh', disabled: checkingThis || row.sourceKind !== 'registry', onClick: check }, checkingThis ? t('正在检查…', 'Checking…') : target === '@stardustlc/dsh-suite' ? t('检查整包更新', 'Check Suite updates') : t('检查更新', 'Check for updates')) },
      original.bundledBy && h(W.Status, null, t('此插件随 Suite 安装。以下设置与安装作用于 Suite 整包，以保持组件版本一致。单独安装的插件可以独立更新。', 'This plugin was installed through Suite. These controls update Suite as a package so its components stay consistent. Independently installed plugins update individually.')),
      h('section', { className: 'w-section' }, (original.bundledBy || row.available) && h('p', { className: 'updates-version' }, target + ' · ' + row.version, row.release?.version && row.release.version !== row.version ? ' → ' + row.release.version : ''), h('p', { className: 'w-muted updates-note' }, status), !row.enabled && h('p', { className: 'w-muted' }, t('当前已停用，更新后仍保持停用。', 'Currently disabled; it will remain disabled after updating.')), row.checkedAt && h('p', { className: 'w-muted updates-note' }, t('上次检查：', 'Last checked: ') + new Date(row.checkedAt).toLocaleString(language() === 'en' ? 'en-US' : 'zh-CN')),
        h('div', { className: 'w-toolbar' }, row.available && row.sourceKind === 'registry' && h(W.Button, { variant: 'primary', icon: 'download', disabled: installLocked || row.loadError, onClick: () => setDialog('install') }, target === '@stardustlc/dsh-suite' ? t('更新 Suite 整包', 'Update whole Suite') : t('更新此插件', 'Update this plugin')), row.release && h(W.Button, { variant: 'ghost', onClick: showNotes, 'aria-expanded': notesOpen }, t('更新记录', 'Release notes')), row.available && h(W.Button, { variant: 'ghost', disabled: working, onClick: () => perform(() => api({ action: 'later', name: target, revision: state.preferences.revision })) }, t('明天再提醒', 'Remind me tomorrow')), row.available && prefs.ignoredVersion !== row.release.version && h(W.Button, { variant: 'ghost', disabled: working, onClick: () => perform(() => api({ action: 'ignore', name: target, revision: state.preferences.revision, version: row.release.version })) }, t('忽略此版本提醒', 'Ignore this reminder')))),
      notesOpen && h('section', { className: 'updates-notes', 'aria-label': t('更新记录', 'Release notes') }, h('strong', null, target + ' · ' + (notes?.version || row.release?.version || '')), loadingNotes ? h('p', null, t('正在读取…', 'Loading…')) : notes?.text ? h('pre', null, notes.text) : h('p', null, t('未找到此版本的独立更新记录。', 'No separate notes were found for this version.')), notes?.url && h('a', { href: notes.url, target: '_blank', rel: 'noreferrer noopener' }, t('查看仓库更新记录', 'View repository changelog'))),
      h('details', { className: 'updates-options' }, h('summary', null, t('更新选项', 'Update options'), ' · ', prefs.checkEnabled ? t('自动检查：开', 'Checks: on') : t('自动检查：关', 'Checks: off'), ' · ', prefs.autoInstall ? t('自动安装：开', 'Install: on') : t('自动安装：关', 'Install: off')), h('section', { className: 'updates-settings', 'aria-label': t('这个插件的更新偏好', 'Update preferences for this plugin') },
        h('div', null, h(W.Switch, { label: t('自动检查这个插件的更新', 'Automatically check this plugin'), checked: prefs.checkEnabled, disabled: working || !!snapshot.preferenceError || row.sourceKind !== 'registry', onChange: event => perform(() => save({ checkEnabled: event.target.checked })) }), h('p', { className: 'w-muted updates-note' }, t('默认开启，每天最多一次。只影响这个插件，关闭后仍可手动检查。', 'On by default, at most once daily. This affects only this plugin; manual checks remain available.'))),
        h('div', null, h(W.Switch, { label: t('空闲时自动安装这个插件的补丁', 'Install patches for this plugin while idle'), checked: prefs.autoInstall, disabled: working || !!snapshot.preferenceError || row.sourceKind !== 'registry', onChange: event => event.target.checked ? setDialog('automatic') : perform(() => save({ autoInstall: false })) }), h('p', { className: 'w-muted updates-note' }, t('默认关闭。明确开启后，仅空闲且没有未保存修改时安装兼容补丁。其他插件的开关不变。', 'Off by default. Explicitly enable compatible patches while idle with no unsaved changes. Other plugins’ settings stay unchanged.'))))),
      error && h(W.Status, { tone: 'error' }, message(error)), snapshot.preferenceError && h(W.Status, { tone: 'error' }, message('preferences-unreadable')),
      snapshot.pendingRestart && h(W.Status, null, snapshot.updaterRestart ? message('restart-required') : t('已有更新等待手动重启后生效。你可以继续工作，自动安装已暂停。', 'Some updates need a manual restart. Continue your work; automatic installation is paused.')),
      prefs.autoInstall && snapshot.autoReady === false && h(W.Status, null, message('page-not-ready')),
      snapshot.pages.clients.some(client => !client.fresh) && h(W.Status, null, h('p', null, t('有窗口已断开，无法确认是否还有未保存修改。仍在使用的窗口请先保存并刷新；已关闭的窗口可以手动重新确认。', 'A disconnected window may contain unsaved changes. Save and refresh windows still in use. If they are closed, you can confirm that manually.')), h(W.Button, { onClick: () => setDialog('windows') }, t('重新确认已关闭的窗口', 'Confirm closed windows'))),
      (snapshot.pages.dirty || ownPage.dirty) && h(W.Status, null, message('page-dirty')), (snapshot.activity.busy || pageBusy) && h(W.Status, null, message(snapshot.activity.busy ? 'busy' : 'page-busy')),
      prefs.deferredUntil > Date.now() && h(W.Status, null, t('此插件已推迟提醒和自动安装 24 小时，仍可手动更新。', 'Reminders and automatic installation for this plugin are deferred for 24 hours. Manual updates remain available.')),
      unconfirmed && h(W.Status, { tone: 'error' }, message('operation-unconfirmed')),
      job && h('section', { className: 'w-section', 'aria-label': t('这个插件的更新进度', 'Update progress for this plugin') }, h('h3', null, jobLabel(job)), h('p', { className: 'w-muted' }, job.from + ' → ' + job.to + (job.mode === 'automatic' ? t(' · 自动补丁更新', ' · Automatic patch') : '')), (job.reason || job.outcome?.result?.error?.code) && h(W.Status, { tone: 'error' }, message(job.reason || job.outcome.result.error.code)), activeJob() && h(W.Button, { disabled: job.state === 'cancelling', onClick: () => perform(() => api({ action: 'cancel', id: job.id })) }, t('取消更新', 'Cancel update')), h('p', { className: 'w-muted updates-note' }, t('安装开始后，取消由官方包管理器处理；已落盘的写入以实际结果或恢复状态为准。', 'After installation starts, the native package manager handles cancellation. Completed writes and recovery are reported as they occur.'))),
      dialog && h(W.Dialog, { title: dialog === 'windows' ? t('断开的窗口都已关闭？', 'Are the disconnected windows closed?') : dialog === 'automatic' ? t('允许这个插件自动安装补丁？', 'Allow automatic patches for this plugin?') : t('确认更新此插件', 'Confirm this plugin update'), closeLabel: t('关闭', 'Close'), onClose: () => setDialog(null) },
        target === '@stardustlc/dsh-suite' && h('p', null, t('此处操作的是 Suite 整包，包含 18 个组件。独立安装的其他插件不受影响。', 'This action applies to the whole Suite, including its 18 components. Other independently installed plugins are unaffected.')),
        dialog === 'windows' ? h('div', { className: 'w-stack' }, h('p', null, t('只清除超过 45 秒未回应的其他窗口记录。请先确认它们已经关闭；仍在使用的窗口请保存修改并刷新。当前或仍在回应的窗口保护会保留。', 'Only other windows silent for over 45 seconds are cleared. Confirm that they are closed; save and refresh windows still in use. Current and responsive windows remain protected.')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('取消', 'Cancel')), h(W.Button, { onClick: () => { setDialog(null); void perform(() => api({ ...pageState(true), action: 'reconfirm-windows', confirmation: 'other-stale-windows-are-closed' })); } }, t('已关闭，重新确认状态', 'They are closed; reconfirm')))) :
        dialog === 'automatic' ? h('div', { className: 'w-stack' }, h('p', null, (language() === 'en' ? row.labelEn : row.label) + ' · ' + target), h('p', null, t('你正在主动启用这个插件的自动安装。只处理兼容的稳定补丁；有任务、未保存修改、未知窗口或等待重启时暂停。', 'You are explicitly enabling automatic installation for this plugin. Only compatible stable patches qualify; running tasks, unsaved changes, unknown windows or a pending restart pause it.')), h('p', null, t('不会自动重启 DSH，其他插件不会跟着开启。可随时关闭。', 'DSH will not restart automatically, and other plugins will not be enabled for automatic updates. Turn it off anytime.')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('保持关闭', 'Keep off')), h(W.Button, { variant: 'primary', onClick: () => { setDialog(null); void perform(() => save({ checkEnabled: true, autoInstall: true }, 'enable-idle-patch-updates')); } }, t('允许此插件自动安装补丁', 'Allow patches for this plugin')))) :
        h('div', { className: 'w-stack' }, h('p', { className: 'updates-version' }, target + ': ' + row.version + ' → ' + row.release.version), h('p', null, t('通过 DSH 官方插件管理器安装。需要重启时，由你手动决定时间；停用状态会保留。', 'Install through DSH’s native plugin manager. Choose when to restart if needed; disabled status is preserved.')), h('p', { className: 'w-muted' }, t('来源：npm 官方 registry，网络不可达时回退 npmmirror。安装前再次核对版本与完整性。', 'Source: official npm registry, with npmmirror fallback if unreachable. Version and integrity are checked again before installation.')), (ownPage.dirty || snapshot.pages.dirty) && h(W.Status, null, message('page-dirty')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('取消', 'Cancel')), h(W.Button, { variant: 'primary', disabled: installLocked || row.loadError, onClick: install }, t('确认安装此版本', 'Install this version')))))
    );
  }
  function NativeFooter({ subject }) {
    const snapshot = useSnapshot(), name = __stardustUpdatesDetailName(subject, snapshot?.rows || []);
    return name ? h(Panel, { name }) : null;
  }
  function Reminder() {
    useSnapshot();
    const row = state?.rows.find(row => { const prefs = preferences(row.name); return row.available && !row.updating && !row.bundledBy && prefs.checkEnabled && prefs.deferredUntil <= Date.now() && prefs.ignoredVersion !== row.release.version && !notified.has(row.name + '@' + row.release.version); });
    if (!row && !legacyHint) return null;
    let Toast; try { Toast = require('@deepseek-ai/dsh-client-ui-primitives').Toast; } catch { return null; }
    if (!Toast) return null;
    const hint = legacyHint, key = hint ? 'legacy-' + hint : row.name + '@' + row.release.version;
    return h(Toast, { key, text: hint ? hint + t('：请打开「插件」中的此插件详情页，在底部管理更新。', ': open its details in Plugins to manage updates at the bottom.') : (language() === 'en' ? row.labelEn : row.label) + t('有新版本，可在页面底部查看。', ' has an update. Review it at the bottom of its page.'), icon: h(W.Icon, { name: 'refresh', size: 18 }), holdMs: 7000, onDone: () => { if (hint) legacyHint = null; else notified.add(key); notify(); } });
  }
  function register() {
    if (!alive) return;
    if (!registered) {
      registered = true; pool.clients.add(client);
      ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'stardustlc.plugin-update-footer', order: 1000 }, NativeFooter));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stardustlc.plugin-update-reminder' }, Reminder));
      notify();
    }
  }
  async function poll() {
    if (inPoll || !alive || !shared.refs.size) return;
    inPoll = true;
    try { await refresh(); register(); await heartbeat(); }
    catch { /* Owner-only controls stay absent for guests and unsupported hosts. */ }
    finally { inPoll = false; }
  }
  const timer = setInterval(() => { void poll(); }, 15000), first = setTimeout(() => { void poll(); }, 100);
  const client = { t, Footer: Panel, Button: W.Button, open(name) { const footer = [...document.querySelectorAll('[data-plugin-update-footer]')].find(node => node.getAttribute('data-plugin-update-footer') === name); if (footer) footer.scrollIntoView({ block: 'end', behavior: 'smooth' }); else { legacyHint = name; notify(); } }, has: name => registered && !!originalRow(name), row: rowFor, dispose() {
    close(); alive = false; clearTimeout(first); clearInterval(timer); pool.clients.delete(client);
    pool.listeners.delete(guardChanged); listeners.clear();
    for (const event of ['pointerdown', 'keydown', 'input']) document.removeEventListener(event, interaction, true);
    window.removeEventListener('pagehide', close);
    for (const controller of requests) controller.abort();
    for (const listener of pool.viewListeners) listener();
  } };
  return client;
}

/* STARDUSTLC_UPDATE_CLIENT_BODY_START */
window.__ModuleLoader__.load(__stardustUpdatesWrap({id:"deepseek-computer-use",factory:require=>({apply(){}})},{"name":"deepseek-computer-use","version":"0.1.0","hasWorkbench":false,"packageVersion":"0.2.9","label":"电脑操作","labelEn":"Computer Use","suiteComponent":false,"sectionIds":[],"iconData":"data:image/webp;base64,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"}));

/* STARDUSTLC_UPDATE_CLIENT_BODY_END */
})();
