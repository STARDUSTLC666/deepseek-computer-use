/* The build injects the CSS module, clsx, and Harness client primitives. */
function createConsoleWorkbench(React, primitives, clsx, css, stylesheet, release) {
  const { createElement: h, useState, useEffect, useRef, useMemo, useCallback, useId } = React;
  const { Button, Input, Switch, MenuSurface } = primitives;
  const W = { Page: ({ children, ...props }) => h('section', props, children) };
  const skinKey = 'dsh-suite-ui-style';
  const skinEvent = 'dsh-suite-ui-style-change';
  const skins = [
    ['dsh-native', 'DSH 原生', 'DSH Native'], ['mac-island', 'Arc 浮岛', 'Arc Islands'],
    ['raycast', 'Raycast 聚光', 'Raycast'], ['bento', 'Bento 矩阵', 'Bento'],
  ];
  const gateNames = ['Hard Deny', 'Reachability', 'App Consent', 'Action Approval', 'Redact', 'Foreground Proof', 'Snapshot TTL'];
  const chineseGates = ['硬拒绝', '可达性', '应用授权', '敏感动作审批', '隐私遮罩', '前台焦点证明', '快照 TTL'];
  const neutralApps = { savedGrants: [], sessionGrants: [], refusedApplications: [], redactedApplications: [] };
  const noElements = [];
  const read = (key, fallback) => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* privacy mode */ } };
  const readSkin = () => {
    const value = read(skinKey, 'dsh-native');
    return skins.some(([id]) => id === value) ? value : 'dsh-native';
  };
  const dimension = (side, fallback) => Math.min(440, Math.max(200, Number(read('deepseek-computer-use:' + side, fallback)) || fallback));
  const endpoint = () => new URL('api/deepseek-computer-use/workbench', document.baseURI);

  async function api(action, fields = {}, signal) {
    const response = await fetch(endpoint(), {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'content-type': 'application/json', 'x-deepseek-computer-use': '1' },
      body: JSON.stringify({ action, ...fields }),
    });
    if (action === 'image' && response.ok) return response.blob();
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Workbench service unavailable (HTTP ' + response.status + ')');
    const result = await response.json();
    if (!result.ok) throw new Error(result.error ?? result.code);
    return result.value;
  }

  function useSkin() {
    const [skin, setSkin] = useState(readSkin);
    useEffect(() => {
      const update = event => {
        if (event.type === 'storage' && event.key && event.key !== skinKey) return;
        const value = event.detail?.style;
        setSkin(skins.some(([id]) => id === value) ? value : readSkin());
      };
      window.addEventListener('storage', update);
      window.addEventListener(skinEvent, update);
      window.addEventListener(skinKey, update);
      return () => {
        window.removeEventListener('storage', update);
        window.removeEventListener(skinEvent, update);
        window.removeEventListener(skinKey, update);
      };
    }, []);
    return [skin, value => {
      write(skinKey, value);
      setSkin(value);
      window.dispatchEvent(new CustomEvent(skinEvent, { detail: { style: value } }));
    }];
  }

  function useShot(snapshotId, shotId) {
    const [image, setImage] = useState(null);
    useEffect(() => {
      if (!snapshotId || !shotId) return;
      const controller = new AbortController();
      let url;
      api('image', { snapshotId, id: shotId }, controller.signal).then(blob => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage({ snapshotId, shotId, url });
      }).catch(() => {});
      return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
    }, [snapshotId, shotId]);
    return image && image.snapshotId === snapshotId && image.shotId === shotId ? image.url : null;
  }

  function useRefresh(windowKey) {
    const [state, setState] = useState(null);
    const [error, setError] = useState('');
    const request = useRef(null);
    const refresh = useCallback(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const next = await api('state', { windowKey }, controller.signal);
        if (!controller.signal.aborted) { setState(next); setError(''); }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message);
      }
    }, [windowKey]);
    useEffect(() => {
      const system = new AbortController();
      const update = () => { if (!document.hidden) void refresh(); };
      const systemStatus = () => {
        if (!document.hidden) api('system', {}, system.signal).then(update, () => {});
      };
      void refresh();
      systemStatus();
      const interval = setInterval(update, 2200);
      const systemInterval = setInterval(systemStatus, 12000);
      return () => { clearInterval(interval); clearInterval(systemInterval); request.current?.abort(); system.abort(); };
    }, [refresh]);
    return { state, error, refresh };
  }

  function Tabs({ items, selected, onSelect, label }) {
    return h('div', { className: css.tabs, role: 'group', 'aria-label': label },
      ...items.map(([id, text]) => h(Button, { key: id, size: 'sm', 'aria-pressed': selected === id, onClick: () => onSelect(id) }, text)));
  }

  function Stat({ tone = 'neutral', children }) {
    return h('span', { className: css.stat, 'data-tone': tone }, h('i', { 'aria-hidden': true }), children);
  }

  const pointSpotlight = event => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--spot-x', event.clientX - rect.left + 'px');
    card.style.setProperty('--spot-y', event.clientY - rect.top + 'px');
  };

  function Permissions({ apps, icons, compact, onFold, onAction, onSelectApp, appId, busy, t }) {
    const [tab, setTab] = useState('all');
    const [query, setQuery] = useState('');
    const grants = [...apps.savedGrants, ...apps.sessionGrants];
    const all = tab === 'all' ? [...grants, ...apps.refusedApplications] : tab === 'grants' ? grants : tab === 'refused' ? apps.refusedApplications
      : apps.redactedApplications.map(id => [...grants, ...apps.refusedApplications].find(row => row.id === id) ?? { id, displayName: id });
    const search = query.trim().toLowerCase();
    const rows = all.filter(row => [row.displayName, row.id, row.executablePath].some(field => field?.toLowerCase().includes(search)));
    return h('aside', { className: clsx(css.pane, css.rail), 'data-folded': compact },
      h('header', { className: css.paneHeader }, h('h2', null, t('应用授权与脱敏矩阵', 'App access and redaction'), h('code', null, 'ctx.cuaAccess')),
        h(Button, { size: 'sm', onClick: onFold, 'aria-expanded': !compact }, compact ? t('展开', 'Expand') : t('收起', 'Collapse'))),
      !compact && h(React.Fragment, null,
        h(Tabs, { items: [
          ['all', t('全部', 'All') + ' ' + (grants.length + apps.refusedApplications.length)],
          ['grants', t('已授权', 'Granted') + ' ' + grants.length], ['refused', t('已拒绝', 'Refused') + ' ' + apps.refusedApplications.length],
          ['redact', t('隐私遮罩', 'Redaction') + ' ' + apps.redactedApplications.length],
        ], selected: tab, onSelect: setTab, label: t('授权类型', 'Permission category') }),
        h('div', { className: css.filters }, h(Input, { type: 'search', value: query, onChange: e => setQuery(e.target.value),
          'aria-label': t('搜索应用', 'Search apps'), placeholder: t('应用名或可执行文件路径', 'App name or executable path') })),
        h('div', { className: css.scroll },
          ...rows.map(row => {
            const icon = icons[row.executablePath];
            const refused = row.decision === 'refused';
            const decision = row.decision === 'always' ? t('始终允许', 'Always allow')
              : row.decision === 'session' ? t('本会话', 'This session') : refused ? t('已拒绝', 'Refused') : null;
            return h('article', { className: clsx(css.appRow, css.spotlight), key: row.id, onPointerMove: pointSpotlight,
              'data-selected': appId === row.id, 'data-decision': row.decision,
              title: t('后台 UIA 操作可读取控件。系统指针操作需要证明目标窗口在前台。', 'Background UIA can read controls. Pointer input requires the target in the foreground.') },
              h('div', { className: css.appIdentity }, h('div', { className: css.icon },
                icon ? h('img', { src: icon, alt: '', width: 36, height: 36 }) : Array.from(row.displayName || row.id)[0]?.toUpperCase()),
              h('div', { className: css.appText },
                h('strong', null, row.displayName || row.id, decision && h('span', { className: css.label }, decision)),
                h('small', { title: row.id }, row.aumid ?? row.id),
                Number.isInteger(row.generation) && h('code', null, 'revocationGen: #' + row.generation))),
              tab !== 'redact' && h('div', { className: css.rowActions },
                h(Button, { size: 'sm', variant: 'outline', disabled: busy, onClick: () => onSelectApp(row.id) }, t('选窗', 'Window')),
                !apps.redactedApplications.includes(row.id) && h(Button, { size: 'sm', disabled: busy, onClick: () => onAction('redact', { id: row.id }) },
                  t('脱敏', 'Redact')),
                h(Button, { size: 'sm', disabled: busy, onClick: () => onAction(refused ? 'retry' : 'revoke', { id: row.id }) },
                  refused ? t('允许再次询问', 'Allow asking again') : t('撤销', 'Revoke'))));
          }),
          rows.length === 0 && h('p', { className: css.empty }, search ? t('没有符合条件的应用', 'No matching apps') : t('此列表暂无应用', 'No apps in this list')))));
  }

  function Splitter({ side, value, update, t }) {
    const drag = useRef(null);
    const label = side === 'left' ? t('调整授权栏宽度', 'Resize permissions panel') : t('调整检查器宽度', 'Resize inspector');
    return h('div', { className: css.resize, 'data-side': side, role: 'separator', tabIndex: 0, 'aria-label': label,
      'aria-orientation': 'vertical', 'aria-valuemin': 200, 'aria-valuemax': 440, 'aria-valuenow': value,
      onPointerDown(event) {
        drag.current = { x: event.clientX, value };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event) {
        if (drag.current) update(drag.current.value + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1));
      },
      onLostPointerCapture() { drag.current = null; },
      onKeyDown(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        update(value + (event.key === 'ArrowRight' ? 12 : -12) * (side === 'left' ? 1 : -1));
      },
    });
  }

  function Screenshot({ view, windows, selectWindow, focus, onFocus, onSelect, details, onAction, busy, cursorSuppressed, t }) {
    const [boxes, setBoxes] = useState(true);
    const [relative, setRelative] = useState(false);
    const [shotIndex, setShotIndex] = useState(0);
    const [crop, setCrop] = useState(false);
    const [region, setRegion] = useState({ x: 0, y: 0, width: 320, height: 240 });
    const shot = view?.screenshots?.[shotIndex] ?? view?.screenshots?.[0];
    const url = useShot(view?.id, shot?.id);
    const coords = useRef(null);
    const sx = shot?.scaleX || 1, sy = shot?.scaleY || 1;
    const overlays = useMemo(() => {
      if (!shot || !boxes) return [];
      return (view?.accessibility?.elements ?? noElements).filter(element => element.width > 0 && element.height > 0
        && (element.valueWritable || element.actions?.length || ['Edit', 'Button', 'MenuItem', 'ComboBox', 'Document'].includes(element.role))).flatMap(element => {
        const x = (element.x - shot.originX) / sx;
        const y = (element.y - shot.originY) / sy;
        const w = element.width / sx, height = element.height / sy;
        if (x >= shot.width || y >= shot.height || x + w <= 0 || y + height <= 0) return [];
        return [{ id: element.index, x, y, w, height }];
      });
    }, [view?.accessibility, shot, boxes, sx, sy]);
    const onPointerMove = event => {
      if (!coords.current || !shot) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) / rect.width * shot.width);
      const y = Math.floor((event.clientY - rect.top) / rect.height * shot.height);
      if (relative) {
        const client = view.clientBounds ?? view.bounds;
        const unit = value => Math.min(999, Math.max(0, Math.round(value * 1000)));
        coords.current.textContent = client
          ? unit((x * sx + shot.originX - client.x) / client.width) + ', ' + unit((y * sy + shot.originY - client.y) / client.height)
          : '—';
      } else coords.current.textContent = x + ', ' + y + ' px';
    };
    const point = view?.point && shot ? [(view.point[0] - shot.originX) / sx, (view.point[1] - shot.originY) / sy] : null;
    return h('section', { className: clsx(css.pane, css.stage) },
      h('header', { className: clsx(css.paneHeader, css.observation) },
        h('label', { className: css.windowSelect }, t('观测窗口', 'Window'),
          h('select', { value: view?.windowKey ?? '', 'aria-label': t('观测窗口', 'Window to observe'),
            onChange: event => { selectWindow(event.target.value); setShotIndex(0); setCrop(false); } },
          windows.length === 0 && h('option', { value: '' }, t('暂无窗口快照', 'No window observations')),
          ...windows.map(window => h('option', { key: window.windowKey, value: window.windowKey }, window.title)))),
        h(Button, { size: 'sm', variant: 'outline', disabled: busy || !view?.active,
          onClick: () => onAction('observe', { snapshotId: view.id, ...details }) }, t('重新观测', 'Observe again'))),
      h('div', { className: css.stageToolbar },
        h(Button, { size: 'sm', variant: 'outline', 'aria-pressed': relative, onClick: () => { setRelative(!relative); if (coords.current) coords.current.textContent = '—'; } },
          relative ? t('坐标 · 千分比 0–999', 'Coordinates · 0–999') : t('坐标 · 截图像素', 'Coordinates · Pixels')),
        h(Button, { size: 'sm', variant: 'outline', 'aria-pressed': crop, disabled: !view?.active || view.redacted,
          onClick: () => {
            if (!crop && view.bounds) setRegion({ x: 0, y: 0, width: Math.min(320, view.bounds.width), height: Math.min(240, view.bounds.height) });
            setCrop(!crop);
          } }, t('区域裁剪', 'Crop region')),
        h(Button, { size: 'sm', variant: 'outline', 'aria-pressed': boxes, onClick: () => setBoxes(!boxes) }, t('控件框', 'Element boxes'))),
      crop && view?.active && h('form', { className: css.cropForm, onSubmit: event => {
        event.preventDefault();
        void onAction('observe', { snapshotId: view.id, ...details, region });
      } }, ...[['x', 'X'], ['y', 'Y'], ['width', t('宽', 'Width')], ['height', t('高', 'Height')]].map(([key, label]) =>
        h('label', { key }, label, h(Input, { type: 'number', required: true, value: region[key], min: key.length === 1 ? 0 : 1,
          onChange: event => setRegion({ ...region, [key]: Number(event.target.value) }) }))),
      h(Button, { size: 'sm', variant: 'primary', type: 'submit', disabled: busy }, t('截取区域', 'Capture crop'))),
      h('div', { className: css.viewport, onPointerMove: pointSpotlight },
        h('div', { className: css.displayFrame, 'data-image': Boolean(url), 'data-active': cursorSuppressed },
        view?.redacted ? h('div', { className: css.stageEmpty }, h('b', null, t('已遮罩截图', 'Screenshot redacted')),
          h('span', null, t('此应用的截图受隐私策略保护。', 'The app has screenshot redaction enabled.')))
          : !shot ? h('div', { className: css.stageEmpty },
            h('svg', { viewBox: '0 0 24 24', width: 38, height: 38, fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, 'aria-hidden': true },
              h('rect', { x: 2, y: 4, width: 20, height: 14, rx: 2 }), h('path', { d: 'M8 22h8m-4-4v4' })),
            h('b', null, t('等待窗口截图', 'Waiting for a window screenshot')),
            h('span', null, t('在会话中调用 get_window_state，工作台会显示观测结果。', 'Call get_window_state in a session to see its observation here.')))
          : !url ? h('div', { className: css.stageEmpty, role: 'status' }, t('读取窗口截图…', 'Loading window screenshot…'))
          : h('div', { className: css.shot, style: { '--shot-width': shot.width + 'px', '--shot-ratio': shot.width / shot.height },
            onPointerMove, onPointerLeave: () => { if (coords.current) coords.current.textContent = '—'; } },
            h('img', { src: url, alt: view.title || t('当前窗口截图', 'Current window screenshot'), width: shot.width, height: shot.height, draggable: false }),
            h('svg', { className: css.boxes, viewBox: '0 0 ' + shot.width + ' ' + shot.height, 'aria-hidden': true },
              ...overlays.map(item => h('g', { key: item.id, className: css.box, 'data-highlight': focus === item.id,
                onPointerEnter: () => onFocus(item.id), onPointerLeave: () => onFocus(null), onClick: () => onSelect(item.id) },
              h('rect', { x: item.x, y: item.y, width: item.w, height: item.height, rx: 3, vectorEffect: 'non-scaling-stroke' }),
              h('text', { x: item.x + 4, y: Math.max(13, item.y + 12) }, '[' + item.id + ']'))),
              point && h('path', { className: css.crosshair, vectorEffect: 'non-scaling-stroke',
                d: 'M' + (point[0] - 10) + ' ' + point[1] + 'h20 M' + point[0] + ' ' + (point[1] - 10) + 'v20' }))))),
      h('div', { className: css.stageFooter },
        h('span', null, shot ? shot.width + ' × ' + shot.height : t('截图', 'Screenshot')),
        view?.dpiScale && h('code', null, Math.round(view.dpiScale * 100) + '% DPI'),
        view?.screenshots?.length > 1 && h('select', { value: Math.min(shotIndex, view.screenshots.length - 1),
          'aria-label': t('截图图层', 'Screenshot layer'), onChange: e => setShotIndex(Number(e.target.value)) },
        ...view.screenshots.map((item, index) => h('option', { key: item.id, value: index },
          index === 0 ? t('主窗口', 'Main window') : t('图层 ', 'Layer ') + index))),
        h('output', { ref: coords }, '—')),
      ...(view?.notices ?? []).map(notice => h('p', { key: notice, className: css.notice }, notice)));
  }

  function Audit({ entries, t }) {
    const timing = entries.find(entry => entry.timing)?.timing?.stages;
    const phases = timing && [
      [t('校验', 'Geometry'), timing.geometryCheckMs], [timing.backend || t('抓屏', 'Capture'), timing.captureMs],
      ['PNG', timing.encodePngMs], [t('附件', 'Attachment'), timing.attachmentAdmitMs],
    ];
    const hints = {
      WINDOW_CHANGED: t('窗口尺寸或 DPI 改变后，请重新观测。', 'Observe again after a window resize or DPI change.'),
      MODEL_DOES_NOT_SUPPORT_IMAGES: t('关闭 include_screenshot 并打开 include_text。', 'Turn off include_screenshot and turn on include_text.'),
      APP_ACCESS_REVOKED: t('重新选择应用以发起授权。', 'Select the app again to request access.'),
      fresh_observation_required: t('重新获取窗口状态后再操作。', 'Refresh window state before acting.'),
      screen_locked: t('解锁 Windows 桌面后继续。', 'Unlock the Windows desktop to continue.'),
    };
    return h('div', { className: css.scroll },
      phases && h('div', { className: clsx(css.timing, css.spotlight), onPointerMove: pointSpotlight },
        h('strong', null, '[cua-screenshot]'), h('div', { className: css.bar },
          ...phases.map(([label, ms]) => h('span', { key: label, style: { flexGrow: Math.max(1, ms ?? 0) } }))),
        h('div', { className: css.barLegend }, ...phases.map(([label, ms]) => h('span', { key: label }, label + ' ' + (ms ?? '—') + ' ms')))),
      entries.length === 0 && h('p', { className: css.empty }, t('暂无动作可审计', 'No actions to audit')),
      ...entries.map(entry => h('article', { className: css.auditRow, key: entry.id },
        h('div', { className: css.auditTitle }, h('code', null, entry.name), h('time', null, new Date(entry.at).toLocaleTimeString())),
        entry.code && h('code', { className: css.failure }, entry.code),
        entry.code && hints[entry.code] && h('small', null, hints[entry.code]),
        h('div', { className: css.auditGates }, ...entry.gates.map((gate, index) => h('span', {
          key: gate.gate, title: gate.gate + ' · ' + gate.state, 'data-state': gate.state,
        }, t(chineseGates[index], gate.gate)))))));
  }

  function Inspector({ view, entries, focus, selected, onFocus, onSelect, details, setDetails, onAction, busy, ptc, t }) {
    const [tab, setTab] = useState('tree');
    const [query, setQuery] = useState('');
    const [writable, setWritable] = useState(false);
    const [edit, setEdit] = useState(null);
    const [code, setCode] = useState(null);
    const [programOutput, setProgramOutput] = useState(null);
    __stardustUpdatesGuard(React, 'deepseek-computer-use', { dirty: code !== null, busy });
    const items = view?.accessibility?.elements ?? noElements;
    const search = query.trim().toLowerCase();
    const filtered = useMemo(() => items.filter(element => (!writable || element.valueWritable)
      && [element.name, element.role, String(element.index), element.automationId].some(value => value?.toLowerCase().includes(search))),
    [items, search, writable]);
    const chosen = items.find(item => item.index === selected);
    const selector = view?.appId ? JSON.stringify(view.appId) : '(await cua.listApps())[0].id';
    const script = code ?? "const app = await cua.getApp(" + selector + ");\nconst [window] = await app.getWindows();\nconst win = await app.getWindow(window.id);\nawait inspect((await win.getAccessibilityTree()).tree);";
    const select = element => { setTab('tree'); onSelect(element); setEdit(null); };
    useEffect(() => { if (selected !== null) setTab('tree'); }, [selected]);
    return h('aside', { className: clsx(css.pane, css.inspector) },
      h('header', { className: css.paneHeader }, h('h2', null, t('观测树 · 阶段耗时与 PTC 桥接', 'Observation, timing and PTC')),
        view?.accessibility && h('span', { className: css.label }, items.length + ' UIA')),
      h(Tabs, { label: t('检查器视图', 'Inspector view'), items: [
        ['tree', t('无障碍树 (UIA)', 'UIA tree')], ['audit', t('审计流和耗时', 'Audit and timing')], ['ptc', 'PTC (cua_run_code)'],
      ], selected: tab, onSelect: setTab }),
      tab === 'audit' ? h(Audit, { entries, t })
        : tab === 'ptc' ? h('div', { className: clsx(css.scroll, css.program) },
          h('strong', null, 'cua_run_code'), h('p', null, ptc?.persistent ? t('保留对象运行时已启用。', 'The runtime retains CUA objects.')
            : t('已配置的 Harness PTC 运行时决定是否跨调用保留对象。', 'The configured Harness PTC runtime controls object retention.')),
          h('textarea', { className: css.editor, rows: 8, value: script, onChange: event => setCode(event.target.value),
            spellCheck: false, 'aria-label': t('PTC 脚本', 'PTC script') }),
          h('div', { className: css.fieldRow },
            h(Button, { size: 'sm', variant: 'primary', disabled: !view?.active || !ptc?.available || busy, onClick: async () => {
              setProgramOutput(null);
              const output = await onAction('program', { snapshotId: view.id, code: script });
              if (output) setProgramOutput(output);
            } }, t('执行 PTC', 'Run PTC')),
            h(Button, { size: 'sm', variant: 'outline', onClick: () => navigator.clipboard?.writeText(script).catch(() => {}) }, t('复制脚本', 'Copy code')),
            code !== null && h(Button, { size: 'sm', onClick: () => setCode(null) }, t('恢复示例', 'Reset example'))),
          programOutput && h('pre', { role: 'status' }, [...(programOutput.logs ?? []), ...(programOutput.display ?? []).map(value =>
            typeof value === 'string' ? value : value.attachmentId), programOutput.result === undefined ? '' : JSON.stringify(programOutput.result, null, 2)].join('\n')))
        : h(React.Fragment, null,
          h('div', { className: css.filters },
            h(Input, { type: 'search', value: query, onChange: e => setQuery(e.target.value),
              'aria-label': t('过滤控件', 'Filter elements'), placeholder: t('搜索编号、名称或角色', 'Search index, name, or role') }),
            h('div', { className: css.fieldRow },
              h('label', null, h('input', { type: 'checkbox', checked: writable, onChange: e => setWritable(e.target.checked) }), t('仅可写', 'Writable')),
              h('label', null, h('input', { type: 'checkbox', checked: details.includeMenus, onChange: e => setDetails({ ...details, includeMenus: e.target.checked }) }), t('菜单', 'Menus')),
              h('label', null, h('input', { type: 'checkbox', checked: details.details, onChange: e => setDetails({ ...details, details: e.target.checked }) }), t('详细字段', 'Details')))),
          h('div', { className: css.scroll },
            view?.accessibility?.hasUnreadableElements && h('p', { className: css.notice }, t('部分控件无法读取。', 'Some controls could not be read.')),
            filtered.length === 0 && h('p', { className: css.empty }, items.length ? t('没有匹配的控件', 'No matching controls') : t('等待 include_text 观测', 'Waiting for an include_text observation')),
            ...filtered.map(element => h('article', { key: element.index, className: clsx(css.elementCard, css.spotlight),
              'data-highlight': focus === element.index || selected === element.index, onPointerMove: pointSpotlight,
              onPointerEnter: () => onFocus(element.index), onPointerLeave: () => onFocus(null) },
            h('button', { type: 'button', className: css.element, 'aria-pressed': selected === element.index,
              style: { '--depth': Math.min(4, element.depth ?? 0) }, onClick: () => select(element.index),
              onFocus: () => onFocus(element.index), onBlur: () => onFocus(null) },
            h('code', null, '#' + element.index), h('span', { className: css.role }, element.role),
            h('span', { className: css.elementName, title: element.name }, element.name || '—')),
            h('div', { className: css.elementDetail },
              [element.focused && 'focused', element.valueWritable && 'valueWritable', element.selected && 'selected'].filter(Boolean).map(flag =>
                h('span', { key: flag, className: css.label }, flag)),
              element.automationId && h('code', { title: t('自动化 ID', 'Automation ID') }, 'aid=' + element.automationId),
              Number.isFinite(element.x) && h('code', null, 'rect=[' + [element.x, element.y, element.width, element.height].join(', ') + ']'),
              element.actions?.length > 0 && h('code', null, element.actions.join(' · ')))))),
          chosen && h('div', { className: css.selection },
            h('div', { className: css.fieldRow },
              h(Button, { size: 'sm', onClick: () => navigator.clipboard?.writeText(String(chosen.index)).catch(() => {}) }, t('复制编号', 'Copy index')),
              chosen.actions?.includes('Invoke') && h(Button, { size: 'sm', disabled: busy || !view.active, onClick: () => onAction('invoke', { snapshotId: view.id, element: chosen.index }) }, 'Invoke'),
              chosen.valueWritable && h(Button, { size: 'sm', disabled: busy || !view.active, onClick: () => setEdit({ snapshotId: view.id, element: chosen.index, value: '' }) }, 'set_value')),
            edit?.snapshotId === view.id && edit.element === chosen.index && h('form', { className: css.fieldRow, onSubmit: event => {
              event.preventDefault(); void onAction('setValue', edit); setEdit(null);
            } }, h(Input, { value: edit.value, 'aria-label': t('新值', 'New value'), onChange: event => setEdit({ ...edit, value: event.target.value }) }),
            h(Button, { type: 'submit', size: 'sm', variant: 'primary', disabled: busy }, t('写入', 'Set'))))));
  }

  function CommandPalette({ close, onAction, dryRun, t }) {
    const dialog = useRef(null);
    const [filter, setFilter] = useState('');
    const title = useId();
    useEffect(() => { dialog.current?.showModal(); }, []);
    const commands = [
      [t('停止助手并恢复光标', 'Stop helper and restore cursor'), 'stop', {}, 'Esc'],
      [t('恢复系统光标', 'Restore system cursor'), 'restore', {}],
      [t('切换演练模式', 'Toggle dry run'), 'dryRun', { enabled: !dryRun }],
      [t('撤销会话授权', 'Revoke session grants'), 'revokeSessions', {}],
      [t('运行自检', 'Run diagnostics'), 'health', {}],
    ].filter(([label]) => label.toLowerCase().includes(filter.trim().toLowerCase()));
    return h('dialog', { ref: dialog, className: css.dialog, 'aria-labelledby': title,
      onCancel: event => { event.preventDefault(); close(); }, onClick: event => { if (event.target === dialog.current) close(); } },
      h(MenuSurface, { className: css.palette },
        h('header', { className: css.paneHeader }, h('h2', { id: title }, t('命令面板', 'Command palette')),
          h(Button, { size: 'sm', onClick: close }, t('关闭', 'Close'))),
        h('div', { className: css.filters }, h(Input, { autoFocus: true, type: 'search', value: filter,
          onChange: event => setFilter(event.target.value), 'aria-label': t('搜索命令', 'Search commands'), placeholder: t('搜索命令…', 'Search commands…') })),
        ...commands.map(([label, action, params, key]) => h(Button, { key: action, className: css.command,
          onClick: () => { close(); void onAction(action, params); } }, label, key && h('kbd', null, key))),
        commands.length === 0 && h('p', { className: css.empty }, t('没有匹配的命令', 'No matching commands'))));
  }

  return function ConsoleWorkbench({ locale, theme, watchTheme }) {
    const [lang, setLang] = useState(() => locale?.getSnapshot?.().active ?? document.documentElement.lang);
    const t = useCallback((zh, en) => String(lang).startsWith('en') ? en : zh, [lang]);
    useEffect(() => locale?.subscribe?.(() => setLang(locale.getSnapshot().active)), [locale]);
    const [hostDark, setHostDark] = useState(() => theme?.getTheme?.()?.active?.colorScheme === 'dark');
    const [paletteMode, setPaletteMode] = useState(() => read('deepseek-computer-use:theme', 'auto'));
    useEffect(() => watchTheme?.(state => setHostDark(state.active.colorScheme === 'dark')), [watchTheme]);
    const dark = paletteMode === 'dark' || (paletteMode === 'auto' && hostDark);
    const toggleTheme = () => {
      const next = dark ? 'light' : 'dark';
      setPaletteMode(next);
      write('deepseek-computer-use:theme', next);
    };
    const [windowKey, selectWindow] = useState('');
    const { state, error, refresh } = useRefresh(windowKey);
    const [skin, setSkin] = useSkin();
    const [left, setLeft] = useState(() => dimension('left', 310));
    const [right, setRight] = useState(() => dimension('right', 407));
    const [folded, setFolded] = useState(() => read('deepseek-computer-use:folded', '') === 'true');
    const [palette, setPalette] = useState(false);
    const [icons, setIcons] = useState({});
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [registries, setRegistries] = useState([]);
    const [focus, setFocus] = useState(null);
    const [selected, setSelected] = useState(null);
    const [details, setDetails] = useState({ includeMenus: false, details: true });
    const apps = state?.applications ?? neutralApps;
    const view = state?.snapshot ?? null;
    const entries = state?.audit ?? [];
    const runtime = state?.runtime;
    const dryRun = state?.dryRun === true;
    const iconsKey = JSON.stringify([...apps.savedGrants, ...apps.sessionGrants, ...apps.refusedApplications].map(row => row.executablePath));
    const activeOps = useRef(new Set());

    useEffect(() => {
      if (iconsKey === '[]') { setIcons({}); return; }
      const controller = new AbortController();
      api('icons', {}, controller.signal).then(setIcons, () => {});
      return () => controller.abort();
    }, [iconsKey]);
    useEffect(() => { setFocus(null); setSelected(null); }, [view?.id]);
    useEffect(() => () => { for (const operation of activeOps.current) operation.abort(); }, []);

    const action = useCallback(async (name, params = {}) => {
      // The emergency stop is independent of an in-flight consent or control edit.
      if (activeOps.current.size && name !== 'stop') return;
      const operation = new AbortController();
      activeOps.current.add(operation);
      setBusy(true);
      setFeedback('');
      try {
        const result = await api(name, params, operation.signal);
        if (name === 'registries') setRegistries(result);
        if (name === 'stop') setFeedback(t('助手已停止，系统光标已恢复。', 'Helper stopped and system cursor restored.'));
        else if (name === 'health') setFeedback(t('自检完成 · ', 'Diagnostics complete · ') + (result?.protocolVersion ? 'Helper v' + result.protocolVersion : result?.platform ?? 'Windows'));
        else setFeedback(t('操作完成', 'Done'));
        await refresh();
        return result;
      } catch (cause) {
        if (!operation.signal.aborted) setFeedback(cause.message);
      } finally {
        activeOps.current.delete(operation);
        if (!operation.signal.aborted) setBusy(activeOps.current.size > 0);
      }
    }, [refresh, t]);

    useEffect(() => {
      const shortcut = event => {
        if (event.isComposing || event.repeat) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          event.stopPropagation();
          setPalette(open => !open);
        } else if (event.key === 'Escape' && !palette) {
          event.preventDefault();
          void action('stop');
        }
      };
      window.addEventListener('keydown', shortcut, true);
      return () => window.removeEventListener('keydown', shortcut, true);
    }, [palette, action]);

    const resize = (side, update) => value => {
      const width = Math.round(Math.max(200, Math.min(440, value)));
      update(width);
      write('deepseek-computer-use:' + side, width);
    };
    const last = entries[0];
    const capture = entries.find(entry => entry.timing)?.timing?.stages?.backend;
    const localizedDesktop = runtime?.sessionLocked == null ? t('桌面待检测', 'Desktop pending')
      : runtime.sessionLocked ? t('桌面已锁定', 'Desktop locked') : t('桌面已解锁', 'Desktop unlocked');
    return h(W.Page, { className: css.shell, 'data-skin': skin, 'data-theme': dark ? 'dark' : 'light', 'data-rail-folded': folded,
      style: { '--rail-width': left + 'px', '--inspector-width': right + 'px' }, 'aria-label': 'Computer Use' },
      h('style', null, stylesheet),
      h('header', { className: css.top },
        h('div', { className: css.brand }, h('div', { className: css.emblem, 'aria-hidden': true },
          h('svg', { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round' },
            h('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2.5 }), h('path', { d: 'M8 21h8m-4-4v4' }), h('circle', { cx: 12, cy: 10, r: 2.5 }))),
        h('div', { className: css.heading }, h('h1', null, 'deepseek-computer-use', h('small', null, 'v' + release)),
          h('p', null, t('DSH 清透原生工作台 · UIA + SendInput + WGC (.NET 4.8)', 'DSH workbench · UIA + SendInput + WGC (.NET 4.8)')))),
        h('div', { className: css.actions },
          h(Tabs, { label: t('工作台皮肤', 'Workbench style'), items: skins.map(([id, zh, en]) => [id, t(zh, en)]), selected: skin, onSelect: setSkin }),
          h('div', { className: css.dry }, h(Switch, { label: t('演练模式', 'Dry run'), checked: dryRun, disabled: busy || !state,
            onChange: enabled => action('dryRun', { enabled }) }), h('code', null, 'dryRun: ' + (dryRun ? 'ON' : 'OFF'))),
          h(Button, { size: 'sm', variant: 'outline', onClick: toggleTheme }, dark ? t('浅色', 'Light') : t('柔和暗色', 'Dark')),
          h(Button, { size: 'sm', variant: 'outline', onClick: () => setPalette(true) }, t('命令', 'Commands'), h('kbd', null, 'Ctrl K')),
          h(Button, { className: css.danger, size: 'sm', variant: 'outline', onClick: () => action('stop') },
            t('急停 & 恢复光标', 'Stop & restore cursor'), h('kbd', null, 'Esc'))),
        h('div', { className: css.runtime },
          h(Stat, { tone: runtime ? 'accent' : 'neutral' }, runtime?.protocolVersion
            ? (runtime.providerRegistered ? 'ctx.computerUse · v' : 'Helper v') + runtime.protocolVersion : t('助手待检测', 'Helper pending')),
          h(Stat, { tone: runtime ? 'good' : 'neutral' }, capture || runtime
            ? t('抓屏 · ', 'Capture · ') + (capture === 'wgc' || (!capture && runtime.captureAvailable) ? 'WGC' : capture ?? 'PrintWindow / BitBlt')
            : t('抓屏待检测', 'Capture pending')),
          h(Stat, { tone: runtime?.sessionLocked ? 'bad' : runtime ? 'good' : 'neutral' }, localizedDesktop),
          h(Stat, { tone: runtime?.cursorSuppressed ? 'accent' : 'neutral' }, runtime?.cursorSuppressed ? t('虚拟光标', 'Virtual cursor') : t('系统光标', 'System cursor')),
          h(Stat, { tone: runtime?.audioEnabled && runtime.audioAvailable ? 'good' : 'neutral' },
            runtime?.audioEnabled && runtime.audioAvailable ? 'WASAPI On' : 'WASAPI Off'))),
      h('section', { className: css.gates, 'aria-label': t('安全闸门', 'Safety gates') },
        h('div', { className: css.gateList }, h('strong', null, t('安全闸门', 'Safety gates')),
          ...gateNames.flatMap((gate, index) => [
            ...(index > 0 ? [h('span', { key: gate + '-arrow', className: css.gateArrow, 'aria-hidden': true }, '→')] : []),
            h('span', { key: gate, className: css.gate,
              'data-state': last?.gates.find(item => item.gate === gate)?.state ?? 'skipped', title: gate }, t(chineseGates[index], gate)),
          ])),
        h(Button, { size: 'sm', variant: 'outline', disabled: busy, onClick: () => action('health') }, t('自检', 'Diagnostics'))),
      (error || feedback) && h('div', { className: clsx(css.feedback, error && css.failure), role: error ? 'alert' : 'status' },
        error || feedback, h(Button, { size: 'sm', onClick: error ? refresh : () => setFeedback('') }, error ? t('重试', 'Retry') : t('关闭', 'Dismiss'))),
      h('div', { className: css.workspace },
        h(Permissions, { apps, icons, appId: view?.appId, compact: folded, onAction: action, busy, t,
          onSelectApp: id => {
            const item = state?.windows?.find(window => window.appId === id);
            if (item) selectWindow(item.windowKey);
            else setFeedback(t('此应用暂无窗口观测。', 'No observation for this application.'));
          },
          onFold: () => {
          write('deepseek-computer-use:folded', String(!folded)); setFolded(!folded);
        } }),
        !folded && h(Splitter, { side: 'left', value: left, update: resize('left', setLeft), t }),
        h(Screenshot, { view, windows: state?.windows ?? [], selectWindow, focus: focus ?? selected, cursorSuppressed: runtime?.cursorSuppressed === true,
          onFocus: setFocus, onSelect: setSelected, details, onAction: action, busy, t }),
        h(Splitter, { side: 'right', value: right, update: resize('right', setRight), t }),
        h(Inspector, { view, entries, focus, selected, onFocus: setFocus, onSelect: setSelected,
          details, setDetails, onAction: action, busy, ptc: state?.ptc, t })),
      h('div', { className: css.registry },
        h(Button, { size: 'sm', disabled: busy, onClick: () => action('registries') }, t('探测 npm 源', 'Probe npm registries')),
        ...registries.map(result => h('span', { key: result.registry },
          result.registry + ' · ' + (result.version ? 'v' + result.version : t('不可用', 'Unavailable')) + ' · ' + result.elapsedMs + ' ms'))),
      palette && h(CommandPalette, { close: () => setPalette(false), onAction: action, dryRun, t }));
  };
}
