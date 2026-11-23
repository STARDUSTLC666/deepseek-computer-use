> 完整使用说明。首页已按用途、安装和操作流程重新整理；这里保留详细参数、安全闸门、错误码处置、原生协议、边界与更新规则。

# deepseek-computer-use

[English](./REFERENCE.en.md)

[![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-total-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use)

[下载统计说明](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

![deepseek-computer-use 大肥鱼桌面控制封面](https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/assets/cover-whale-girl.png)

[![npm](https://img.shields.io/npm/v/deepseek-computer-use.svg)](https://www.npmjs.com/package/deepseek-computer-use)
[![Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4.svg)](#安装)
[![Node.js 22.19+ / 24+](https://img.shields.io/badge/node-22.19%2B%20%2F%2024%2B-339933.svg)](../package.json)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)

> 社区插件，**非 DeepSeek 官方出品**。官方包在 `@deepseek-ai/*` scope 下。

让 DeepSeek Harness 操作 Windows 桌面软件：发现窗口、查看截图和界面控件，再执行鼠标键盘操作。适合没有可用 API 的图形界面任务；提供原生 4 皮肤工作台、`/cu` 直控命令、7 道安全闸门、会话应用授权与操作审计。

提供 **17 个平铺工具**、保留式 **CUA 对象桥接**（`cua`），以及可用 TypeScript PTC 运行时下的 **`cua_run_code`**，并随包附带面向助手的操作手册技能 [`computer-use-windows`](../skills/computer-use/SKILL.md)。
底层采用 **UI Automation + SendInput + Windows.Graphics.Capture**，工具语义参考 Codex window2，并针对 DSH 的会话、附件、审批与取消机制适配。

零 npm 原生依赖、零额外 .NET 运行时依赖：helper 和覆盖层首次使用时由 Windows 自带 `csc.exe` 按源码哈希缓存编译；WGC 抓屏与 WASAPI 录音组件均为 `.NET Framework 4.8` 程序，Windows 10/11 原生运行。

欢迎使用，遇到问题或有改进建议，请提交 [issues](https://github.com/STARDUSTLC666/deepseek-computer-use/issues) 和 [PR](https://github.com/STARDUSTLC666/deepseek-computer-use/pulls)。

## 开始使用

1. 在 Windows 10/11 的实际 DSH profile 中安装 `deepseek-computer-use`，重启宿主后新建会话。
2. 首次使用建议先让助手调用 `computer_use_health` 自检，确认 helper、编译器、策略与窗口可见性。
3. 打开目标软件并在对话中说明应用、目标和允许范围；按提示授予本会话或持久应用权限。
4. 先观测（截图或 UIA 控件树）再执行点击/输入；敏感动作核对审批内容，失败或结果不明时重新观测，避免重复提交。
5. 需要立即中断时，按 `Esc`、在工作台点击「急停 & 恢复光标」、发送 `/cu stop` 或取消当前任务。

## 安装

要求：**Windows 10/11**、**Node.js 22.19+ / 24+**、**DSH `>=0.2.2-rc.3`**（独立配套插件，不在 `dsh-suite` 18 件套内）。

推荐在 DSH 桌面版原生「插件」面板搜索并安装 `deepseek-computer-use`，或运行命令行：

```bash
dsh plugin --profile desktop add deepseek-computer-use
```

网页版将 `desktop` 改为 `web`。插件通过 `package.json` 的 `dsh.bundle.patch`（`./cordis.patch.yml`）自动接入宿主配置；安装完成后重启实际使用的 profile 并新建会话，调用 `computer_use_health` 验证就绪状态。

<details>
<summary>源码开发与可选抓屏 / 录音组件构建</summary>

从本仓库源码构建或开发时：

```bash
pnpm install
npm run build          # 构建工作台客户端、用 csc 编 helper/overlay，并尝试编译 capture/audio
```

没有 .NET SDK 时也能正常使用核心能力：抓屏自动回退到 `PrintWindow` / `BitBlt`，录音会明确返回 `audio_missing`。如需在本机 profile 加载本地源码目录，可通过 `dsh plugin` 指定本地包路径或 `npm pack` 产物安装。

</details>

## 自检与测试

```bash
npm run test:contracts # 参数、策略、桥接与工作台契约回归（不操控桌面）
npm test               # 构建 + 契约回归 + 原生 WinForms 固定装置集成测试
npm run test:harness -- --dsh-root /path/to/node_modules/@deepseek-ai/dsh
# test:harness 启动隔离的真实 DSH CLI/profile，验证附件、审批和原生操作（结束后清理隔离 profile）
# npm run test:all 另含真实系统音频录制测试，按需运行
```

WinForms 固定装置（`test/bin/dsh-cu-fixture.exe`，含文本框与名为 `"Delete all"` 的危险按钮，独立于被硬拒绝的 shell 进程）用于验证 17 个平铺工具、CUA 桥接、截图数组与 `origin`/`zIndex`、`accessibility: null` 语义、`set_value`、`type_text`、危险按钮审批、`dryRun`、`denyApps`、Win 键硬拒绝与 `scroll` 契约。

## DeepSeek Harness 接入与原生工作台

插件通过 DSH 的 `apply(ctx)` / `inject` / `cordis.patch.yml` 接入，独占注册 `ctx.computerUse` provider 槽位，并提供以下能力面：

- **工具与 CUA / PTC 接入**：按 `exposeMode`（`hybrid` / `tools` / `cua`）暴露 17 个平铺工具与保留式 `cua` 对象桥接；当宿主挂载 TypeScript PTC 运行时，额外提供 `cua_run_code` 编排执行（支持 `inspect()` 输出文本与截图附件，单次程序上限 64 KiB / 100 次子调用）。
- **原生工作台**：注册 `sidebar.panellist` 与 `main` 槽位，支持 4 种与 Suite 同步的皮肤布局（`dsh-native` / `mac-island` / `raycast` / `bento`），通过 `/api/deepseek-computer-use/workbench` 查看应用权限矩阵、实时快照与区域裁剪、编号 UIA 控件树、抓屏阶段耗时、7 道安全闸门状态、操作审计、PTC 演练以及 npmjs / npmmirror 源探测；底部自带原地更新控件。
- **直控斜杠命令 `/cu`**：
  - `/cu status`：查看当前电脑操作状态与抓屏链路诊断
  - `/cu stop`：立即停止当前轮次原生控制并恢复光标
  - `/cu restore-cursor`：恢复系统光标状态
  - `/cu revoke <应用名或 ID>`：立即撤销指定应用授权并失效旧句柄
- **随包技能**：自动挂载 `skills/computer-use/SKILL.md`（`computer-use-windows`），规范助手的「观测 → 单步操作 → 复查」循环与失败处置。
- **会话隔离与串行化**：每个会话独立维护临时授权、Helper 进程、截图与元素快照；持久授权按 profile 落地。同一物理桌面的全部操作串行排队执行；DSH 附件缩放图片时自动把坐标换算回原始抓屏像素。
- **中止与失败恢复**：
  - 超时或取消会先通知当前原生请求停止；输入循环持续检查取消标记并在 `finally` 释放按键/鼠标按钮。helper 未在 500ms 内退出时强制终止，确保旧进程已退出再返回错误。
  - 监听 `session/event` 的 `turn/end` 与 `session/disposed`，主动停止该会话的 helper 与覆盖层，不依赖下一次工具调用。
  - 输入或抓屏失败后清空旧快照，后续输入报 `fresh_observation_required`，必须重新成功调用 `get_window_state` 后才能继续。
  - 每次新 helper 生成新的截图 id，且与插件通过 **协议版本 v3**（`PROTOCOL_VERSION = 3`）握手校验；版本不匹配直接报 `protocol_mismatch`。

## 架构

```text
DSH 宿主
  └─ lib/index.js          apply(ctx) → 互斥槽位、17 平铺工具、CUA/PTC、/cu 命令、工作台路由与随包 Skill
       ├─ lib/tools.js     17 个平铺工具定义（Codex window2 语义 + 内部 show_window）
       ├─ lib/cua-host.js  保留式 CUA 对象桥接（cua）与 TypeScript PTC 执行（cua_run_code）
       ├─ lib/access.js    按会话/profile 应用授权持久化与撤销代次
       ├─ lib/safety.js    7 道安全闸门判定与策略错误
       ├─ lib/workbench.js 工作台 HTTP 控制器（17 动作 + 请求体字节上限校验）
       └─ lib/bridge.js    常驻进程 + 串行 JSON-lines RPC（协议 v3）+ 超时/取消 + 洁净 Win32 环境
            └─ native/.build/prepared/<hash>/dsh-computer-use-helper.exe
                 ├─ native/Driver.cs   IPlatformDriver 契约 + WindowsDriver（UIA / SendInput / WGC / PrintWindow）
                 ├─ native/Json.cs     零依赖 JSON 解析与序列化
                 └─ native/Program.cs  stdio 分发与协议 v3 握手
```

驱动层通过 `IPlatformDriver` 抽象，当前实现 `windows` 驱动；helper 与覆盖层编译产物按源码内容哈希缓存在 `native/.build/prepared/<hash>/`，启动子进程时自动剥离 Electron / Node 调试环境变量。

## 工具清单

### 17 个平铺工具（`exposeMode: "hybrid"` 或 `"tools"`）

| 工具 | 作用 |
|---|---|
| `list_apps` | 列出当前有可操作窗口的应用及其窗口（`{ apps, count }`） |
| `list_windows` | 列出可见窗口：id / 标题 / 所属应用 / z 序 / 边框（`{ windows, count }`） |
| `get_window` | 按 id 重新读取窗口（换绑、刷新边框与状态） |
| `launch_app` | 启动应用（exe 路径、AUMID `shell:AppsFolder\...` 或 shell URI，可带参数），默认走审批 |
| `get_window_state` | 观测窗口：默认抓截图（支持 `region: { x, y, width, height }` 局部裁剪），`include_text: true` 返回编号无障碍树；纯文本模型路由自动切为仅 UIA |
| `click` | 按 `element_index`（优先 UIA Invoke，抗遮挡）、截图坐标或 `relative: true`（`0..999` 客户区千分比）点击；支持 `mouse_button` / `click_count` / `hold_ms` / `modifiers` |
| `mouse_move` | 解析并移动悬停点（支持像素坐标、`screenshotId`、`relative: true`）；显式传 `useSystemPointer: true` 并经确认后移动物理系统指针，否则返回解析坐标与 `dispatched: false` |
| `press_key` | 单键或组合键，X keysym 风格：`Control_L+s`、`Return`、`KP_0` / `Numpad_Add` |
| `type_text` | 注入 Unicode 文本（与键盘布局无关，中文安全） |
| `scroll` | 在指定坐标（`x`, `y` 必填，支持 `screenshotId` / `relative`）滚动 |
| `drag` | 窗口内拖拽（支持起点/终点截图坐标、`relative`、`modifiers` 与拖拽路径校验） |
| `set_value` | 通过 UIA Value 模式直接改值，无需焦点切换与模拟敲键 |
| `perform_secondary_action` | 执行 UIA 语义动作：Invoke / Expand / Collapse / Toggle / Select / Scroll 等 |
| `activate_window` | 将目标窗口提到前台 |
| `start_audio_recording` | 开始录制系统音频（WASAPI 环回），需 `audio: true` 或环境变量 `DSH_CU_AUDIO=1`，并经独立音频确认 |
| `stop_audio_recording` | 停止录音并返回 WAV 路径、24 kHz 立体声 16-bit base64 与 `data_url` |
| `computer_use_health` | 自检：helper 状态与协议版本、抓屏/录音组件、策略配置与实时窗口数 |

> 另含内部辅助动作 `show_window`（供 CUA 对象恢复窗口而不抢占前台）。

### CUA 对象桥接与 PTC 编排（`exposeMode: "hybrid"` 或 `"cua"`）

| 工具 | 作用 |
|---|---|
| `cua` | 面向保留式应用/窗口句柄的对象桥接（`listApps`、`getApp`、`getWindows`、`getWindow`、`getAccessibilityTree`、`getScreenshot`、`click`、`mouseMove`、`drag`、`scroll`、`type`、`pressKey`、`activate`、`show` 等），受应用撤销代次保护 |
| `cua_run_code` | 当宿主挂载 TypeScript PTC 运行时自动注册：在受控沙箱中以 TypeScript 编排 `cua` 对象并通过 `inspect(...)` 返回文本或截图附件 |

## 使用中指示器（Display + Cursor Overlay）

- **Display Overlay（呼吸细边）**：在屏幕外沿绘制 1.4px 强调色细线与 3 层呼吸光环（3.2s 周期、8 个细长分层窗口），底部居中展示 `DSH 正在使用您的电脑 · Esc 取消` 玻璃胶囊；WGC 按窗口抓取时天然排除覆盖层。
- **Cursor Overlay（虚拟光标与系统光标抑制）**：以 0.35 缓动跟踪每个动作点；默认通过 `SetSystemCursor` 抑制真实光标，并设 5 层恢复保障（正常/Esc/超时退出钩子、独立 `--cursor-guard` 守卫进程、helper 500ms 看门狗、helper 启动自检、dispose `restore_cursor` RPC）。需要始终显示系统光标时可设 `DSH_CU_KEEP_CURSOR=1`。
- **DPI 感知**：覆盖层与 helper 均为 Per-Monitor-V2 感知；对老式 DPI 虚拟化窗口自动裁掉黑边并按物理/截图像素比换算坐标。
- **Esc 按 turn 生效**：首次触发返回 `cancelled_by_user`，同一 turn 后续调用直接报 `turn_stopped`，新 turn 自动恢复。

## 安全模型（7 道闸门顺序）

每次受控动作按固定顺序依次通过以下 **7 道闸门**（与工作台顶部安全闸门条顺序一致）：

1. **Hard Deny（硬拒绝）**：不可被任何用户审批覆盖。包括终端与 Shell（Windows Terminal、cmd、PowerShell、pwsh、WSL、mintty、ConsoleWindowClass）、运行对话框、密码管理器（1Password/KeePass/Bitwarden 等）、安全软件/Windows 安全中心、UAC/认证弹窗、DSH 宿主自身与其他 AI 助手窗口，以及 Windows / Meta / Super 键族（单键或任意组合键）。
2. **Reachability（可达性）**：按 `denyApps`（命中即拒）与 `allowApps`（非空时仅放行白名单）过滤 exe 路径、进程名与窗口标题。
3. **App Consent（应用授权）**：默认 `appConsent: "session"`，通过宿主 User Questions 对每个应用选择「本会话允许 / 始终允许 / 拒绝」。批准后向 helper 下发 `approve_app` 并在原生层二次强制校验；撤销应用立即递增代次，使所有旧句柄报 `APP_ACCESS_REVOKED`。
4. **Action Approval（敏感动作审批）**：`approval` 支持 `never` / `sensitive`（默认）/ `always`。`sensitive` 下命中 `riskyPattern`（delete/uninstall/pay/submit/删除/卸载/支付/提交等）或调用 `launch_app` 会经宿主审批服务确认；`requireSystemPointerApproval: true` 时移动物理系统指针也会确认。**缺少审批服务或宿主策略为 `never` 时直接拒绝，绝不静默降级。**
5. **Redact（隐私遮罩）**：`redactApps` 命中的应用禁止任何截图捕获，直接返回 `APP_REDACTED`，防止敏感画面离开本机。
6. **Foreground Proof（前台焦点证明）**：`type_text`、`press_key`、坐标点击、`scroll`、`drag` 必须证明目标窗口确实拿到前台，否则拒发 `SendInput` 并返回 `focus_failed` 与当前前台窗口信息。
7. **Snapshot TTL（快照有效期与强制重观测）**：元素编号与截图缓存默认 `snapshotTtlMs: 120000` 过期，窗口尺寸/DPI/属主变化报 `WINDOW_CHANGED`，任何失败输入清空观测并触发 `fresh_observation_required`，防止拿过期编号或漂移坐标误点。

> 另支持 `dryRun: true` 演练模式（仅记录不注入真实输入，可在配置或工作台顶部实时切换）。

## 失败与恢复（错误码处置表）

| 错误码 | 含义 | 处置责任 | 建议动作 |
|---|---|---|---|
| `hard_denied` | 命中终端、密码库、UAC、宿主或 Win 键硬拒绝名单 | 助手告知用户 | 不可绕过或审批覆盖，直接向用户说明限制 |
| `app_denied` / `app_not_allowed` | 目标应用在 `denyApps` 中或不在 `allowApps` 白名单 | 用户调整配置 | 若确需操作，在插件配置更新白/黑名单 |
| `app_not_approved` / `APP_ACCESS_REQUIRED` | 应用尚未完成授权或 CUA 未先 `getApp` | 助手重新申请 / 用户授权 | 经正常授权流程获取本会话或持久许可 |
| `APP_ACCESS_REVOKED` | 应用授权已被撤销或环境已释放，旧句柄失效 | 助手重新选择 | 放弃旧句柄，按需重新 `getApp` 并请用户授权 |
| `approval_denied` | 用户拒绝确认、宿主策略为 `never` 或无审批服务 | 助手停止当前步 | 不重试同动作；向用户汇报或由用户在工作台重开询问 |
| `APP_REDACTED` | 应用被 `redactApps` 禁止截图 | 助手切 UIA / 用户决定 | 改用 `include_screenshot: false, include_text: true` 或由用户解除遮罩 |
| `MODEL_DOES_NOT_SUPPORT_IMAGES` | 当前模型路由不支持图片输入 | 助手自动降级 | 调用 `get_window_state({ window, include_screenshot: false, include_text: true })` |
| `SCREENSHOT_REQUIRED` | 使用 `relative: true` 前尚未观测目标窗口 | 助手先观测 | 先执行一次 `get_window_state`（截图或 UIA）再操作 |
| `WINDOW_CHANGED` | 窗口尺寸、DPI 或所属应用在观测后发生变化 | 助手重新观测 | 重新调用 `get_window_state` 获取新坐标后再操作 |
| `stale_snapshot` | 元素编号过期或不属于最新一次 UIA 观测 | 助手重新观测 | 重新调用 `get_window_state(include_text: true)` 获取新编号 |
| `stale_screenshot` | 指定的 `screenshotId` 已失效 | 助手重新观测 | 重新截屏并使用新返回的 `screenshotId` |
| `point_outside_screenshot` | 坐标落在截图边界之外 | 助手重新核对 | 核对坐标或重新截屏后重试 |
| `fresh_observation_required` | 上一次输入或抓屏失败，状态不确定 | 助手必须重观察 | **严禁盲目重放上次输入**；先 `get_window_state` 确认界面状态 |
| `focus_failed` | 目标窗口未能获得前台（可能被置顶或提权窗口占用） | 用户介入 | 停止循环重试，按报错提示的前台窗口信息请用户切回焦点 |
| `window_gone` | 目标窗口已关闭或句柄失效 | 助手重新枚举 | 调用 `list_windows` / `list_apps` 重新查找 |
| `window_minimized` | 目标窗口已最小化，无法观测 | 助手先激活 | 调用 `activate_window` 后再观测 |
| `screen_locked` | Windows 桌面处于锁屏状态（LockApp） | 用户解锁 | 暂停操作并请用户解锁桌面 |
| `cancelled_by_user` / `turn_stopped` / `turn_ended` | 用户按 `Esc`、`/cu stop` 或本轮对话已结束 | 助手立即停手 | 停止继续调用桌面工具，向用户汇报并等待下一轮 |
| `timeout` / `helper_exited` | 原生请求超时或 helper 异常退出（旧快照已清空） | 助手重新观测 | 检查目标应用状态，先重观测确认未产生副作用再决定下一步 |
| `protocol_mismatch` | 自定义 `helperPath` 与当前插件协议版本（v3）不匹配 | 用户/开发者修复 | 移除过期 `helperPath` 或重新执行 `npm run build` |
| `audio_not_enabled` / `audio_missing` | 未开启音频开关或缺少 `dsh-cu-audio.exe` | 用户配置/构建 | 配置 `audio: true` 或设置环境变量 `DSH_CU_AUDIO=1` 并重启；缺失二进制时构建 audio 组件 |
| `PROVIDER_SHUTTING_DOWN` | 插件正在卸载或热重载回收资源 | 助手稍后重试 | 等待宿主完成重载后在新回合重试 |
| `PTC_UNAVAILABLE` / `PTC_LIMIT` | 宿主未挂载 TypeScript PTC 运行时或超出 100 次子调用上限 | 助手改用平铺工具或拆分脚本 | 退回平铺工具或精简 `cua_run_code` 步骤 |
| `invalid_arguments` / `bad_request` | 参数类型、范围（如相对坐标非 `0..999` 整数）或区域裁剪越界 | 助手修正参数 | 按工具 Schema 修正参数后再调用 |

## 配置

所有配置项均有安全默认值，空配置即可启动（不触碰键鼠或网络）：

| 配置项 | 类型 / 默认值 | 说明 |
|---|---|---|
| `approval` | `'never' \| 'sensitive' \| 'always'`（默认 `'sensitive'`） | 动作级确认策略：`sensitive` 仅对命中 `riskyPattern` 的目标及 `launch_app` 弹窗；`always` 每次动作都问；`never` 跳过动作级询问（不影响硬拒绝与 `appConsent`） |
| `allowApps` | `string[]`（默认 `[]`） | 允许操作的应用白名单（匹配 exe 路径或进程名子串）；空数组表示不限 |
| `denyApps` | `string[]`（默认 `[]`） | 禁止操作的应用黑名单（匹配路径、进程名或标题子串），优先级高于 `allowApps` |
| `appConsent` | `'session' \| 'never'`（默认 `'session'`） | 应用级首次授权门；`session` 为每会话每应用询问一次（支持持久授权与随时撤销） |
| `exposeMode` | `'hybrid' \| 'tools' \| 'cua'`（默认 `'hybrid'`） | 工具暴露模式：`hybrid` 同时暴露 17 个平铺工具与 CUA 桥接；`tools` 仅平铺工具；`cua` 仅对象桥接 |
| `defaultIncludeScreenshot` | `boolean`（默认 `true`） | `get_window_state` 是否默认截屏（纯文本模型路由会自动切为仅 UIA） |
| `screenshotTarget` | `{ longEdge?: number, maxBytes?: number } \| null`（默认 `null`） | 可选截图压缩目标（`longEdge` 128–4096，默认 1600；`maxBytes` 64 KiB–20 MB，默认 2 MB） |
| `maxElements` | `number`（默认 `260`，范围 `20–2000`） | 单次 UIA 观测返回的最大元素数量 |
| `snapshotTtlMs` | `number`（默认 `120000`，范围 `1000–3600000`） | 元素与截图快照有效期（毫秒） |
| `settleMs` | `number`（默认 `1000`，范围 `0–10000`） | 动作完成后下次观测前自动等待界面稳定的时间（毫秒） |
| `maxClickHoldMs` | `number`（默认 `5000`，范围 `0–5000`） | `click` 的 `hold_ms` 长按上限（毫秒） |
| `requireSystemPointerApproval` | `boolean`（默认 `true`） | `mouse_move` / `drag` 显式申请 `useSystemPointer: true` 时是否强制审批 |
| `redactApps` | `string[]`（默认 `[]`） | 禁止截图的应用子串列表（如 `["1password", "银行"]`），在插件层执行 |
| `audio` | `boolean`（默认 `false`） | 是否允许 WASAPI 环回录音（也可通过环境变量 `DSH_CU_AUDIO=1` 开启，首次录音仍需独立确认） |
| `dryRun` | `boolean`（默认 `false`） | 演练模式：校验闸门并记录动作但不注入真实键鼠/启动/录音 |
| `toolPrefix` | `string`（默认 `''`） | 工具名前缀（例如 `'cu_'`），避免与其他插件重名 |
| `timeoutMs` | `number`（默认 `10000`，范围 `1000–120000`） | 普通原生 RPC 超时（毫秒） |
| `launchTimeoutMs` | `number`（默认 `15000`，范围 `1000–120000`） | `launch_app` 专用超时（毫秒） |
| `helperPath` | `string \| null`（默认 `null`） | 自定义 helper 可执行文件路径（需兼容协议 v3，仅受信场景使用） |
| `riskyPattern` | `string`（默认内置中英危险词正则） | `approval: 'sensitive'` 下触发审批的控件标签正则表达式 |

示例（用户 profile 的 `cordis.patch.yml`）：

```yaml
- insert:
    - id: deepseek-computer-use
      name: 'deepseek-computer-use'
      config:
        exposeMode: hybrid             # hybrid | tools | cua
        approval: sensitive            # never | sensitive | always
        appConsent: session            # session | never
        allowApps: []                  # 空 = 不限制；如 ["notepad", "chrome"]
        denyApps: []
        redactApps: []                 # 如 ["1password", "银行"]
        defaultIncludeScreenshot: true
        screenshotTarget: null         # 或 { longEdge: 1600, maxBytes: 2000000 }
        maxElements: 260
        snapshotTtlMs: 120000
        settleMs: 1000
        maxClickHoldMs: 5000
        requireSystemPointerApproval: true
        audio: false                   # 或设置环境变量 DSH_CU_AUDIO=1
        dryRun: false
        toolPrefix: ''                 # 如 'cu_' 避免重名
        timeoutMs: 10000
        launchTimeoutMs: 15000
        helperPath: null
```

## 与 Codex Windows window2 的对照与协议 v3 特性

工具语义以 `@oai/sky` 的 Windows window2 观测与动作契约为参照（独立社区实现，不代表与官方驱动具有相同模型能力或性能）：

- **DSH 接口差异**：`list_windows` / `list_apps` 分别返回 `{ windows, count }` / `{ apps, count }`；`window.app` 返回应用元数据对象（输入也兼容字符串 app id 或仅传 `{ id }`）；`get_window` 接收 `{ window: { id } }`；截图通过 DSH `attachments` 返回附件引用与 image block。
- **协议握手（v3）**：helper 提供 `hello` → `{ protocolVersion: 3, capabilities: [...] }`；bridge 首次连接强校验，不匹配即报 `protocol_mismatch`。
- **Helper v3 增强**：支持客户区千分比相对坐标（`relative: true`，`0..999` 整数）、窗口平移补偿、缩放与 DPI 变动防护（`WINDOW_CHANGED`）、物理像素局部区域裁剪截图（`region: { x, y, width, height }`）、长按释放校验（`hold_ms` ≤ `maxClickHoldMs`）与拖拽路径校验。
- **单请求预算与超时**：每条 RPC 随请求下发 `__budgetMs`（默认 `10s`，`launch_app` `15s`），helper 收缩抓屏等待；退出前先发 `close` 优雅关闭再兜底 kill。
- **抓屏链路**：按顺序尝试 ① **Windows.Graphics.Capture**（`native/bin/capture/dsh-cu-capture.exe`，.NET Framework 4.8 + SharpDX，支持遮挡与 GPU 合成、自动排除覆盖层）→ ② **PrintWindow(PW_RENDERFULLCONTENT)** → ③ **屏幕 BitBlt**。
- **系统音频录制**：`start_audio_recording` / `stop_audio_recording` 通过 `native/bin/audio/dsh-cu-audio.exe`（WASAPI 环回，.NET Framework 4.8 + NAudio）输出 24 kHz 立体声 16-bit WAV（`{ filepath, bytes, data_url }`），单次时长钳制在 `500–300000 ms`，需 `audio: true` 或 `DSH_CU_AUDIO=1` 以及独立的一次性会话确认（`computer-audio`）。

### 原生载荷（`native/bin`）

| 文件 | 用途 | 体积 |
|---|---|---|
| `dsh-computer-use-helper.exe` | UIA / SendInput / 抓屏调度 / 音频调度（首次由 `csc.exe` 现编并按哈希缓存） | ~50KB |
| `dsh-cu-overlay.exe` | 呼吸光边 + 虚拟光标覆盖层（首次由 `csc.exe` 现编并按哈希缓存） | ~30KB |
| `capture/` | WGC 抓屏（.NET Framework 4.8 + SharpDX） | ~0.68MB |
| `audio/` | WASAPI 环回录音（.NET Framework 4.8 + NAudio） | ~0.60MB |

## 能力边界与已知限制

- **仅支持 Windows 10/11**：驱动层已抽象 `IPlatformDriver`，但目前仅有 Windows 实现；macOS / Linux 尚未实现。
- **非 Windows window2 专属接口不在本插件范围**：macOS `paste` / `select_text` 与 Linux full-desktop 的 `clipboard_read/write`、`key_down/up`、`drag_handle`、`get_screenshot` 未提供（窗口悬停定位已由 `mouse_move` 与 CUA `win.mouseMove` 提供；无 `useSystemPointer: true` 时仅返回解析坐标与 `dispatched: false`，因为 Windows UIA 无通用悬停动作）。
- **前台焦点与 UIPI 约束**：不绕过 Windows UIPI，目标窗口权限高于 DSH 进程时系统会拦截注入；前台被置顶或提权窗口占用时，输入类工具会保守报 `focus_failed`（UIA 语义动作 `set_value` / Invoke / Expand 无需前台）。
- **Electron / Chromium / Canvas 界面**：无障碍树通常较薄，建议结合截图 + 坐标或局部 `region` 裁剪操作。
- **应用统计字段**：`App.lastUsedDate` 以进程启动时间近似，`App.useCount` 无可靠本机数据源，按可选字段留空、不伪造。
- **`redactApps` 作用域**：在插件层执行；勿把原生 helper 二进制单独暴露给非受信调用方。
- **安全免责**：本插件可真实驱动宿主机桌面（远程浏览器访问 DSH Web 端时仍操作运行 DSH 的那台 Windows 机器），第三方或生产环境使用前请完成独立安全评审。

## 插件更新

需要 DSH `0.2.2-rc.3` 或更新版本。更新控件直接位于 **「电脑操作」工作台内容末尾** 以及 **原生插件详情页底部**（支持工作台内并发探测 npmjs 与 npmmirror）。检查、更新记录和偏好在原地展开，不增加独立更新页面或设置菜单。自动检查默认开启；**自动安装默认关闭**，明确授权后才会在空闲且没有未保存修改时安装兼容的稳定版本（默认涵盖兼容的小版本与补丁更新，也可限定为仅补丁）。开关按插件独立保存，可关闭、推迟或忽略提醒；不会强制重启 DSH、升级 DSH 本体或替换本地源码安装。

旧版用户先在官方插件管理中手动更新一次，之后才会获得此入口。发布到 npm 不会直接替换用户已经安装的版本。

## License

[MIT](../LICENSE)
