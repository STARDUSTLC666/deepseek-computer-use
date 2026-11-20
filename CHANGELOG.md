# 更新记录

## 0.3.2 (2026-11-20)

- 升级共享更新组件至 0.2.10，移除跨插件右下角浮动提醒，保留工作台及插件详情页更新控制。

- 环境释放统一规范无会话 scope，正确撤销尚在等待的应用授权请求，避免释放后晚到授权重新生效。

## 0.3.1 (2026-11-20)

- 完成发布前授权、会话隔离、撤销、取消与工作台输入限制复查，并验证原生组件构建及不操控桌面的契约回归。
- Verify application consent, session isolation, revocation, cancellation, workbench input limits, native builds, and mock contract regressions before release.
- 同步共享更新组件 0.2.9，修复取消窗口和失败响应清理，并确保运行中旧协调器在空闲后接管修复。

## 0.3.0 (2026-11-20)

- 新增 Harness「电脑控制」工作台，支持四种 Suite 同步布局、权限矩阵、截图与 UIA 联动、操作审计、PTC 和内联更新。
- 接入 provider 互斥槽位、`/cu` 直控命令、应用授权持久化、撤销代次和原生 64px 图标。
- 提供 17 个平铺工具、保留式 CUA 应用和窗口对象，以及可用 TypeScript PTC 运行时下的 `cua_run_code`。
- Helper v3 增加客户区千分比坐标、窗口平移补偿、缩放与 DPI 防护、区域截图、长按释放校验和拖拽路径校验。
- 原生编译产物按内容哈希缓存，子进程剥离 Electron 与 Node 调试环境变量。截图诊断记录抓屏和附件阶段耗时。
- 修复工作台请求体按字符而非字节限制造成的边界，超限流式请求现在在触碰执行后端前拒绝。
- Preserve the 0.3.0 Computer Use workbench and safety model; bound streaming request bodies by UTF-8 bytes before dispatch and retain the Windows fixture regression.

## 0.2.20 (2026-11-20)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.7`：对话页「有新版本」提醒浮卡支持无交互 15 秒自动收起（悬停、聚焦、查看记录或确认弹窗时自动暂停，安装成功提示 6 秒收起，安装中/失败/需要重启仍保持常驻不隐藏）。
- Upgrade `@stardustlc/dsh-updates` to `0.2.7`: auto-dismiss idle update reminder cards after 15s and silent complete cards after 6s while pausing on hover/focus/notes/dialogs and keeping active, failed, or restart-required cards pinned.

## 0.2.19 (2026-11-20)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.6`：同步修复浮卡与日历按钮重叠、详情页/工作台挂载时更新提示不及时让位、`package-moved` 与包管理器错误诊断文案，并保留过期检查自动刷新。
- Upgrade `@stardustlc/dsh-updates` to `0.2.6`: fix floating Calendar FAB clearance, reminder yield on native detail/workbench mount, and `package-moved` / package-manager error guidance; retain stale-check refresh.

## 0.2.18 (2026-11-18)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.5`：独立安装插件详情页底栏去重（保留组合包组件委派与对话页热更新卡片），补齐 `bundle-in-use` 组合包占用提示说明，并在检查结果过期或远端版本变更时自动刷新元数据，彻底消除 `check-first` 卡顿。
- Upgrade `@stardustlc/dsh-updates` to `0.2.5`: deduplicate standalone native plugin detail footers while keeping Suite delegation and in-chat reminder cards, surface clear `bundle-in-use` guidance, and automatically refresh expired update checks without `check-first` stalls.

## 0.2.17 (2026-11-18)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.4`：对话页新增一键热更新提醒卡片，自动检查周期缩短至 6 小时，手动热更新后可顺手开启包含兼容功能小版本的空闲自动更新。
- Upgrade `@stardustlc/dsh-updates` to `0.2.4`: add an actionable in-chat hot-update reminder card, 6-hour background update checks, compatible minor+patch idle auto-updates, and a post-update opt-in prompt.

## 0.2.16 (2026-11-18)

- 同步 `@stardustlc/dsh-updates` 0.2.3：侧边栏工作台平时默认隐藏底部更新栏（零高度占用），仅在检测到兼容新版本或执行更新时浮现单行精简提示条；完整更新设置与检查入口统一保留在 DSH「插件」详情页底部。
- Sync `@stardustlc/dsh-updates` 0.2.3: keep the sidebar workbench update footer hidden by default when up-to-date, surfacing a single-line compact strip only for actionable updates or active jobs while retaining full controls in native Plugin Details.

## 0.2.15 (2026-11-18)

- 更新区底部新增克制、无打扰的 GitHub 点赞与问题反馈快捷链接，并完善中英文检索关键词。
- Add subtle, non-intrusive GitHub Star and issue feedback links in the update footer, and expand search keywords.

## 0.2.14 (2026-11-18)

- 同步 `@stardustlc/dsh-updates` 0.2.1：恢复 Suite 整包统一更新（移除独立拆包迁移），保留整包与独立插件的原地热更新与失败自动回滚。
- Sync `@stardustlc/dsh-updates` 0.2.1: restore unified Suite bundle updates (removing standalone conversion) while retaining in-place hot reload and automatic rollback.

## 0.2.13 (2026-11-18)

- 深度适配 DSH 0.2.2：补齐 manifestVersion 1、双语元数据与 win32 平台声明；改用 Cordis 4 `ctx.effect` 异步清理桥接进程与光标状态，合并同会话并发启动并兼容 `ctx.approval` 审批服务。
- Deeply adapt to DSH 0.2.2: declare manifestVersion 1, bilingual locale metadata, and win32 platform support; migrate bridge and cursor teardown to Cordis 4 `ctx.effect`, deduplicate concurrent session startups, and support `ctx.approval` fallback.

## 0.2.11 (2026-11-17)

- 在原生插件详情页单独检查和安装兼容版本。自动安装默认关闭，可为该插件开启空闲时的稳定补丁更新。
- Check and install compatible versions separately from the native plugin details. Automatic installation is off by default. Enable it for this plugin to apply stable patches while idle.

## 0.2.10 (2026-11-14)

- 适配 DSH 0.2.2-rc.3：最低 Harness 版本声明提升至 0.2.2-rc.3，运行时代码未变。
- Support DSH 0.2.2-rc.3: raise the minimum Harness declaration to 0.2.2-rc.3; runtime code is unchanged.

## 0.2.9 (2026-11-04)

- 同步共享界面：嵌入设置时继承宿主底色，输入框跟随主题，空状态保持可读宽度；新版 DSH 可显示插件设置图标。
- Align embedded surfaces, themed inputs, readable empty states and optional native settings icons.


## 0.2.8 (2026-11-03)

- 文档整理：删除重复且过时的「安装」小节，安装路径只保留原生插件管理 + 重启 + `computer_use_health` 自检。
- 「配置」改为完整选项表（含 `appConsent`、`redactApps`、`riskyPattern`、`launchTimeoutMs` 等），删掉第二份不完整的配置示例。
- 「安全模型」补齐实际闸门顺序：硬拒绝 → 可达性 → 应用授权 → 动作审批 → `redactApps` → 前台证明 → 快照 TTL。
- 新增「失败与恢复」错误码表（18 行），说明每个失败该由用户还是助手处理；合并重复的「已知限制 / 已知边界」。
- 中英文 README 都指向随包技能 `computer-use-windows`，作为助手侧的操作与失败处置手册。
- Documentation pass: remove the duplicated installation section, publish one complete configuration table, document the real safety-gate order, merge the duplicated limitation sections, and add an error-code recovery table plus the bundled skill reference.

## 0.2.7 (2026-10-30)

- 重整中英文首页：用途、三步流程图、安装入口与操作示例；详细配置与边界集中到完整说明。
- 保留下载统计、独立更新选择、问题反馈和贡献入口；原封面与运行功能保留。
- Refresh bilingual landing pages, workflow artwork, quick starts and reference navigation.


## 0.2.6 (2026-10-30)

- 原生插件列表与详情新增专门生成的鲸鱼娘图标：大头像、独立功能符号、透明留白，适合 30 / 36 px 显示；原封面保留。
- Add purpose-made whale-girl artwork with a distinct function emblem, transparent padding and small-size readability; preserve the original cover.


## 0.2.5 (2026-10-29)

- 补齐中英文使用流程：准备、入口、具体操作与结果核对；新增累计 npm 下载徽章并保留月统计。
- Add practical getting-started workflows and lifetime npm download badges alongside monthly counts.

## 0.2.4 (2026-10-29)

- 同步仓库与 npm 的简明介绍、中英文 README 和反馈入口；本次为文档与包元数据更新。
- Sync npm descriptions and both README guides with the repository, including issue and pull-request links.
- Include the English guide in the npm package.

## 0.2.3 (2026-10-27)

- 修复分批更新时的新旧更新控件混用：保留原页面、草稿与安装保护，空闲后接管旧控制器，兼容旧入口。

## 0.2.2 (2026-10-27)

- 更新控件移至原有工作台或原生插件详情页底部；更新记录与选项原地展开，移除独立更新菜单与页面。
- 保留原页面操作与草稿，自动安装默认关闭；安装前确认，遇到未保存修改或运行任务时暂停。

## 0.2.1 (2026-10-27)

- Refresh shared update controls for independent and Suite installations, with explicit whole-bundle scope.
- Keep automatic installation off by default and preserve independent installation behavior.

## 0.2.0 (2026-10-26)

- Add this plugin’s own update controls and independent preferences. Automatic installation stays off until explicitly enabled.
- Confirm manual installs, preserve local sources and disabled state, pause for tasks or unsaved changes, and use native DSH recovery without forced restarts.
- Require the public DSH 0.2.1-rc.3 update APIs; Suite components remain managed through Suite.

## 0.1.2 — 2026-10-18

- 适配真实 DeepSeek Harness：标准 JSON Schema 参数、模型可见的截图附件、审批审计，
  以及会话独立的应用授权、helper 和观测缓存；修正截图缩放后的坐标换算。
- 超时或取消后停止原生请求，确认旧 helper 退出后再返回失败。长文本输入可中途取消，
  按键和鼠标按钮在退出路径释放；回合结束时主动关闭 helper 与覆盖层。
- 输入或抓屏失败后清除观测，要求重新执行 `get_window_state`；截图 id 跨 helper 重启唯一。
  更新时若旧 helper 正被占用，可将新版编译到独立路径。
- 原生协议升级到 **2**。默认 helper 会自动重编译；使用自定义 `helperPath` 时需同步更新。
- 增加 18 项参数、策略和进程生命周期回归，并在 DSH `0.2.1-rc.2`、
  `0.2.1-alpha.5` 中验证真实截图、审批、输入、取消及回合清理。

本版未验证音频录制、多应用长任务或与 Codex 的模型任务成功率对比。
Codex SDK 和二进制未纳入分发，改进为独立实现。
