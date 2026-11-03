> 完整使用说明。首页已按用途、安装和操作流程重新整理；这里保留详细参数、限制、更新规则与历史验证链接。

# deepseek-computer-use

[English](../README.en.md)

[![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-total-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use)

[下载统计说明](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

![deepseek-computer-use 大肥鱼桌面控制封面](https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/assets/cover-whale-girl.png)

[![npm](https://img.shields.io/npm/v/deepseek-computer-use.svg)](https://www.npmjs.com/package/deepseek-computer-use)
[![Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4.svg)](#安装)
[![Node.js 22.19+ / 24+](https://img.shields.io/badge/node-22.19%2B%20%2F%2024%2B-339933.svg)](../package.json)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)

> 社区插件，**非 DeepSeek 官方出品**。官方包在 `@deepseek-ai/*` scope 下。

让 DeepSeek Harness 操作 Windows 桌面软件：发现窗口、查看截图和界面控件，再执行鼠标键盘操作。适合没有可用 API 的图形界面任务；提供会话应用授权、敏感操作确认与审计。

提供 16 个工具，覆盖窗口发现、截图观测、鼠标键盘、控件操作和可选的系统音频录制。
支持会话独立授权、敏感操作审批与审计；取消或回合结束时停止原生助手，
操作失败后要求重新观察，减少结果不明时的重复操作。

底层采用 **UI Automation + SendInput + Windows.Graphics.Capture**，
工具语义参考 Codex window2，并针对 DSH 的会话、审批和截图附件机制适配。

欢迎使用，遇到问题或有改进建议，请提交 [issues](https://github.com/STARDUSTLC666/deepseek-computer-use/issues) 和 [PR](https://github.com/STARDUSTLC666/deepseek-computer-use/pulls)。

零 npm 原生依赖、零 .NET 运行时依赖：helper 和覆盖层用系统自带的 `csc.exe` 现编，
抓屏（WGC）和录音（WASAPI）是 net48 程序，Windows 10/11 自带运行时。

## 开始使用

1. 在 Windows 10/11 的实际 DSH profile 中安装 deepseek-computer-use，然后创建新会话。
2. 打开目标软件，并在对话中说明要操作的应用、目标和允许范围。
3. 按提示批准会话应用授权；先让助手查看窗口截图或界面控件，再执行点击和输入。
4. 敏感操作先核对审批内容；失败或结果不明确时重新观察，避免重复提交。
5. 检查软件中的实际结果；需要中断时取消当前任务，插件会停止本次原生助手。

## 安装

要求 Windows 10/11、Node.js 22.19+ / 24+。推荐从 DSH 原生插件管理按 `deepseek-computer-use` 安装，或运行：

```bash
dsh plugin --profile desktop add deepseek-computer-use
```

网页版把 `desktop` 改为 `web`。完成后重启实际使用的 profile，再新建会话。下面的手动配置用于源码开发，普通安装无需重复修改配置。

<details>
<summary>源码开发与可选抓屏 / 录音组件</summary>

要求：**Windows 10/11**、**Node.js 22.19+ / 24+**。其余都是系统组件（.NET Framework 4.8、
UI Automation、WGC）。

```bash
npm install deepseek-computer-use
```

[npmjs.com/package/deepseek-computer-use](https://www.npmjs.com/package/deepseek-computer-use)

然后在本机 profile 的 `cordis.patch.yml` 里启用（详见本文件末尾的配置示例）：

```yaml
- insert:
    - id: deepseek-computer-use
      name: 'deepseek-computer-use'
```

首次调用任意 Computer Use 工具时会自动编译 helper 与覆盖层（约 1 秒）。
想要抓屏/录音这两项可选能力，再跑一次：

```bash
npm run build          # helper + overlay（csc），再尝试 dotnet 编 capture/audio
```

没有 .NET SDK 也能用：抓屏自动退回 PrintWindow，录音会明确报 `audio_missing`。

</details>

## 自检

```bash
npm test               # DSH 参数/策略回归 + 原生 WinForms 集成验证
npm run test:contracts # 只运行参数与策略测试，不操作桌面
npm run test:harness -- --dsh-root /path/to/node_modules/@deepseek-ai/dsh
# test:harness 启动隔离的真实 DSH CLI/profile，验证附件、审批和原生操作。
# npm run test:all 另含真实系统音频录制测试，按需运行。
```

## DeepSeek Harness 接入

这是通过 DSH 的 `apply(ctx)` / `inject` / bundle patch 接入的独立插件。
工具注册使用标准 JSON Schema，截图通过 `attachments` 保存并输出模型可见的 image block，
应用授权与危险动作通过 `approval.request` 审批并写入会话审计。
每个会话独立保存授权、helper、截图与元素快照；同一桌面的工具调用串行执行。
DSH 附件存储缩小截图时，坐标会自动换算回原始抓屏像素。

在需要使用的 DSH profile 中安装，例如 Git Bash 下：

```bash
dsh plugin --profile web add deepseek-computer-use
dsh web --no-open
```

开发时可将包名换成 `file:E:/deepseek/dsh-computer-use` 来加载本地源码。
以下宿主适配和失败恢复改进包含在 0.1.2 及后续版本中，详见 [更新记录](../CHANGELOG.md)。
`test:harness` 不调用模型、不录音，只操作自己创建的测试窗口，结束后移除隔离 profile。

中止与失败恢复：

- 超时或取消会先通知当前原生请求停止；输入循环检查取消标记，并在 `finally` 释放按键/鼠标按钮。
  helper 未在 500ms 内退出时会被终止；调用失败返回前确认旧进程已经退出。
- DSH 的 `session/event` 出现 `turn/end` 时主动停止该会话的 helper 和覆盖层，不依赖下一次工具调用。
- 输入或抓屏失败会清除已缓存的快照。后续输入返回 `fresh_observation_required`，
  必须成功调用 `get_window_state` 后再决定动作；不会自动重复结果不明的输入。
- 新 helper 使用不同的截图 id，防止重启前的截图编号误命中新缓存。
  原生协议已升级为 2，自定义 `helperPath` 也需要匹配版本。

## 它解决什么问题

DSH 官方已有需要显式启用的实验性 Computer Use 方案，包括 Cua Driver MCP 与原生
提供方；其上游 Cua Driver 也支持 Windows。详见 [官方计算机操作文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/computer-use.zh.md)
和 [Cua Driver 平台支持](https://github.com/trycua/cua/blob/main/docs/content/docs/reference/cua-driver/contracts.mdx)。

本插件是另一套独立的 Windows 社区实现，提供 UI Automation、窗口截图、鼠标键盘、
会话授权、审批审计和中断恢复，用于点击按钮、填写表单或操作没有 API 的桌面软件。
它与官方方案有功能重合；本项目的验收结果不代表已与官方驱动做过效果或性能对比。

## 架构

```text
DSH 宿主
  └─ lib/index.js        apply(ctx) → 注册 16 个工具；图片走 attachments；审批走 approval
       ├─ lib/tools.js   工具定义（Codex window2 语义）
       ├─ lib/safety.js  白名单/黑名单 + 危险动作审批门
       └─ lib/bridge.js  常驻进程 + 串行 JSON-lines RPC + 超时/取消
            └─ native/bin/dsh-computer-use-helper.exe   （用系统 csc.exe 现编）
                 ├─ native/Driver.cs   IPlatformDriver 契约 + WindowsDriver（UIA / SendInput / PrintWindow）
                 ├─ native/Json.cs     零依赖 JSON 解析与序列化
                 └─ native/Program.cs  stdio 分发
```

驱动层是接口（`IPlatformDriver`），今天是 `windows` 一个实现；macOS（AX + CGEvent）
和 Linux（AT-SPI）可以照着补，插件层不用改。

每个会话的 helper 常驻的原因：元素编号必须和"那一次观测"绑在同一个进程里，否则
`click(element_index)` 无从解析。因此插件串行发请求、按 id 配对响应。

## 工具

| 工具 | 作用 |
|---|---|
| `list_apps` | 列出当前有可操作窗口的应用及其窗口 |
| `list_windows` | 列出可见窗口：id / 标题 / 所属应用 / z 序 / 边框 |
| `get_window` | 按 id 重新读取窗口（换绑、刷新边框） |
| `launch_app` | 启动应用（可带参数），默认需要审批 |
| `get_window_state` | 观测：带编号的无障碍树 +（可选）窗口截图 |
| `click` | 按元素编号（优先走 Invoke，抗遮挡）或窗口相对坐标点击 |
| `press_key` | 单键或组合键，X keysym 风格：`Control_L+s`、`Return` |
| `type_text` | 注入 Unicode 文本（与键盘布局无关，中文安全） |
| `scroll` | 在坐标或元素处滚动 |
| `drag` | 窗口内拖拽 |
| `set_value` | 用 Value 模式直接改值，比"点击+全选+输入"更稳更省 |
| `perform_secondary_action` | Invoke / Expand / Collapse / Toggle / Select / Scroll Up… |
| `activate_window` | 把窗口提到前台 |
| `start_audio_recording` | 开始录制系统音频（WASAPI 环回），需 `audio: true` |
| `stop_audio_recording` | 停止录音并返回 WAV 路径与字节数 |
| `computer_use_health` | 自检：helper、编译器、策略、窗口数 |

## 使用中指示器（对齐 Codex 的两个 overlay）

Codex 用两层覆盖层告诉用户"AI 正在动你的电脑"，这里做的是同一套：

**Display Overlay — 呼吸细边**
- 一圈 **1.4px 的强调色细线** + 3 层递减光环，圆角 18px；只占屏幕最外圈，不压内容
- 亮度按约 3.2 秒周期呼吸（内线 alpha 170→240、光环 26→46）
- 4 条边 + 4 个圆角 = 8 个细长分层窗口，每帧位图几 KB
- 底部居中一枚自动宽度玻璃胶囊：脉冲圆点 + `DSH 正在使用您的电脑` +
  `Esc` 键帽 + `取消`，停在任务栏上方留白

**Cursor Overlay — 虚拟光标 + 系统光标抑制**
- 覆盖层存在期间常驻一个带描边和投影的白色指针，启动时落在真实指针位置，
  之后 0.35 缓动滑向每个动作点；背后一层极淡的强调色光晕
- 默认抑制真实系统光标（`SetSystemCursor` 换成透明图标），五层恢复保障：
  1. 正常退出 / Esc / 超时 → 退出钩子里 `SPI_SETCURSORS`
  2. **独立守卫进程**（`--cursor-guard <ownerPid>`）盯着覆盖层，覆盖层被强杀后
     它负责还原——和 Codex 的 `system-cursor-manager` 同一思路
  3. helper 的 **500ms 看门狗**：标记里的 PID 失效就还原，不需要任何请求
  4. helper **启动即自检**：上次会话残留的标记会被清掉
  5. 插件 dispose 时发 `restore_cursor` RPC
- 抑制期间 `%LOCALAPPDATA%\dsh-computer-use\cursor-hidden.flag` 记录自己的 PID，
  守卫只清理属于自己 owner 的标记，不会误伤新一代覆盖层
- Windows 在休眠恢复 / 换分辨率后会重置光标，覆盖层每约 1.8 秒**重新抑制**一次
- 完全不想抑制：`DSH_CU_KEEP_CURSOR=1`
  helper 强杀覆盖层时也会兜底恢复一次

**DPI 关键点**：覆盖层进程必须 Per-Monitor-V2 感知，否则在 150% 缩放屏上
系统会把 1707×1067 的逻辑画面放大到 2560×1600，描边变糊、位置偏移 1.5 倍。

**Esc 是按 turn 生效的**：首次触发报 `cancelled_by_user`，同一 turn 内后续调用直接
`turn_stopped`，新 turn 才恢复。

## 安全模型

1. **可达性**：`allowApps` / `denyApps` 决定这个插件能不能碰某个应用；空数组 = 不限制。
2. **确认**：`approval` 三档
   - `never`：从不询问（自担风险）
   - `sensitive`（默认）：目标元素标签命中危险词（delete/删除/卸载/支付/提交/安装…）才问；
     `launch_app` 总是问
   - `always`：每次动作都问
   审批走 DSH 自己的 approval seam；**没有审批服务时直接拒绝**，绝不静默降级。
   DSH 宿主的 `approval` 策略 `never` 表示拒绝需要审批的请求，与本插件配置项的
   `approval: never`（跳过动作级询问）含义不同。应用授权仍由 `appConsent` 单独控制。
3. **前台证明**：打字、按键、坐标点击、滚动必须先证明目标窗口真的拿到了前台，
   否则抛 `focus_failed` 并告诉你当前是谁占着前台。SendInput 会打到有焦点的窗口，
   这一步省不得。
4. **快照 TTL**：元素编号默认 120 秒过期，过期必须重新观测，避免"拿旧编号点新界面"。
5. **`dryRun`**：只回放动作不注入，用于集成演练。

## 安装

```powershell
# 1. 放进 DSH 的 profile
cd "E:\path\to\dsh-computer-use"
# 方式 A：本地目录挂载（把本目录链进 profile 的 node_modules）
# 方式 B：npm pack 后用宿主插件管理器安装
```

插件通过 `package.json` 的 `dsh.bundle.patch` 声明自己：

```json
{ "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```

`cordis.patch.yml` 负责往宿主配置里插插件行。装好后重启宿主，让模型调
`computer_use_health` 自检；第一次调用会自动编译 helper（约 1-2 秒）。

## 配置

```yaml
- id: deepseek-computer-use
  config:
    approval: sensitive            # never | sensitive | always
    allowApps: ["notepad", "chrome"]   # 空 = 不限制
    denyApps: []
    defaultIncludeScreenshot: true     # 默认抓图；false 可显式关闭
    maxElements: 260
    snapshotTtlMs: 120000
    dryRun: false
    toolPrefix: ''                 # 填 'cu_' 可避免与其他插件的 click 重名
    timeoutMs: 10000
```

## 与 Codex Windows window2 的关系

工具以 `@oai/sky` 的 Windows window2 动作和观测语义为参照，底层也采用 UIA、SendInput、WGC。
它是 DSH 的独立实现，不能据此认为具有相同的模型能力、成功率或全部运行时行为。

DSH 接口有这些明确差异：`list_windows` / `list_apps` 分别返回 `{ windows, count }` /
`{ apps, count }`；`window.app` 返回应用元数据对象，输入也接受字符串 app id 或只提供窗口 id；
`get_window` 接收 `{ window: { id } }`；截图返回 DSH 附件引用和 image block，Codex 使用图片 URL。

| 契约项 | Codex | 本插件 |
|---|---|---|
| `get_window_state` 默认 | 截图 ON、accessibility `null` | 一致（`include_text:true` 才出树） |
| 返回形态 | `{ window, screenshots[], accessibility }` | 一致；`screenshots` 是数组，含窗口 + 关联瞬态 UI（菜单/tooltip），每项带 `id`/`zIndex`/`originX`/`originY`/尺寸 |
| 坐标寻址 | `click`/`scroll`/`drag` 收 `screenshotId` | 一致；坐标系绑定那张截图，过期报 `stale_screenshot` |
| `scroll` | `x`,`y` 必填，无 `element_index` | 一致（缺 x/y 直接拒） |
| accessibility 结构化字段 | `tree`/`focused_element`/`selected_text`/`selected_elements`/`document_text` | 全部实现 |
| 观测节奏 | 动作后自动等约 1s 再抓 | 一致（`settleMs`，默认 1000） |
| 元素失效 | 编号只对产生它的观测有效 | 一致（TTL + helper 进程内缓存） |
| 最小化窗口 | 不该给出无意义画面 | 本插件直接报 `window_minimized`（实测旧版会吐出 334×48 的假图） |
| 键名 | X keysym + `Numpad_*` 别名 | 一致（`KP_0`/`Numpad_Add`/…） |
| `list_apps` | `lastUsedDate`、`useCount` | `lastUsedDate` 用进程启动时间近似，并非用户最近使用时间；`useCount` 留空 |
| `launch_app` | app id / `.exe` 路径（含 UWP） | exe 路径、AUMID（`shell:AppsFolder\\…`）、shell URI |
| Win/Meta 键 | 硬拒绝 | 硬拒绝（插件层 + helper 层双保险） |
| 终端/Run/密码管理器/安全软件/认证对话框/宿主自身 | 硬拒绝 | 硬拒绝（不可被审批覆盖） |
| 按应用授权 | "Computer Use was not approved to use <app>" | 每会话每应用一次审批（`appConsent: session`），批准后下发 `approve_app`，**由 helper 强制**：未批准的应用直接 `app_not_approved` |
| 回合边界 | 回合与 helper 生命周期关联 | DSH 回合结束事件主动停止旧 helper；新回合创建新 helper，并重新下发已获应用授权 |
| 请求预算 | 普通 10s、`launch_app` 15s | 一致（`timeoutMs` / `launchTimeoutMs`） |
| 回合结束停止输入 | `turn_ended` 钩子 | 主动停止正在执行的请求，排队中的旧回合请求也被拒绝 |

## 能力边界

- **`paste` / `select_text`**：属于 macOS 的 window 客户端（`target: "mac"`），Windows 上不存在。
- **系统音频录制**（`start_audio_recording`）：已实现 WASAPI 环回录音，默认关闭，需要构建 audio helper 并单独授权。
- **full-desktop 面**（`clipboard_read/write`、`key_down/up`、`move`、`drag_handle`、`get_screenshot`）：那是 `target: "linux"` 的 API。
- **区域裁剪截图**：当前抓整窗（长边封顶 2560），不能认为与 Codex 的 bounded screenshot 完全等价。
- **Windows.Graphics.Capture**：构建 capture helper 后优先使用 WGC；不可用时回退到 PrintWindow / BitBlt，GPU 窗口的兼容性取决于实际使用的抓屏后端。

## 抓屏链路（对齐 Codex 的 WGC）

按顺序尝试，前一级成功就不走下一级：

1. **Windows.Graphics.Capture**（`native/bin/capture/dsh-cu-capture.exe`，**.NET Framework 4.8** + SharpDX）
   —— 抓窗口的合成层，遮挡可用、GPU/直合成界面正常、无 DPI 黑边。
   **不依赖 .NET 8 运行时**（Framework 4.8 是 Windows 自带组件），载荷仅 0.68MB
2. **PrintWindow(PW_RENDERFULLCONTENT)** —— 无 .NET 8 运行时的机器上的兜底
3. **屏幕 BitBlt** —— 前两者失败或返回黑图时

WGC 走 .NET Framework 4.8（Windows 10/11 自带），**用户不需要安装任何运行时**。
万一抓取失败仍会自动降级到第 2 级。
覆盖层是独立窗口，WGC 按窗口抓取时天然不会被拍进去——和 Codex 的
"exclude display overlay from captures" 等效。

## 已知限制

- **只有 Windows 驱动**。macOS / Linux 只有接口（`IPlatformDriver`），没有实现。
- **前台焦点是硬约束**。前台被置顶工具（如 Process Lasso）或提权窗口占住时，
  `type_text`/`press_key`/坐标点击/`scroll` 会被拒绝并报出占用者。
  语义动作（`set_value`、Invoke 点击、Expand）不需要前台，照常工作。
- **Electron/Chromium 无障碍树很薄**，网页内容要走截图 + 坐标。
- **不绕过 UIPI**：目标窗口权限更高时注入会被系统拦。
- **DPI 虚拟化已处理**：老式/无 DPI 感知的程序按 96 DPI 渲染，窗口物理尺寸被 DWM 放大，
  `PrintWindow` 返回的是未缩放画面（此前会带黑边）。现在抓屏会裁掉黑边，并记录
  「物理像素 / 截图像素」比例（实测某 WinForms 程序为 1.46×），坐标动作按该比例换算，
  所以**截图坐标点哪就点哪**。
- **`useCount`、应用使用历史**没有可靠本机数据源，宁缺不编。

## 测试

```powershell
node test/integration.mjs
```

固定装置是一个独立的 WinForms 可执行文件（`test/bin/dsh-cu-fixture.exe`，一个文本框 +
一个名为 "Delete all" 的按钮；特意不用 shell 托管——shell 窗口本身被硬拒绝）。覆盖：
16 个工具注册、截图数组与 origin/zIndex、`accessibility:null` 语义、`set_value`、
`type_text`、危险按钮触发审批、`dryRun` 不落地、`denyApps` 拒绝、Win 键硬拒绝、
`scroll` 契约。

## 许可

MIT。第三方商用前请自行做安全评审：这个插件能让模型操作你的桌面。

## 原生载荷（native/bin）

| 文件 | 用途 | 大小 |
|---|---|---|
| `dsh-computer-use-helper.exe` | UIA / SendInput / 抓屏调度 / 音频调度 | ~50KB |
| `dsh-cu-overlay.exe` | 呼吸光边 + 虚拟光标覆盖层 | ~30KB |
| `capture/` | WGC 抓屏（.NET Framework 4.8 + SharpDX） | 0.68MB |
| `audio/` | WASAPI 环回录音（NAudio） | 0.60MB |
| **合计** | | **~1.4MB** |

全部基于 Windows 自带的 .NET Framework 4.8，**用户零安装**。

## 与 Codex window2 的细节对齐（第二轮）

| 能力 | 实现 |
|---|---|
| 协议握手 | helper 提供 `hello` → `{ protocolVersion: 2, capabilities: [...] }`；bridge 首次连接校验，不匹配直接报 `protocol_mismatch` |
| 每请求预算 | 客户端把预算随请求下发（`__budgetMs`，对应 Codex 的 `x-oai-cua-request-budget-ms`），helper 用它收缩抓屏等待 |
| 坐标越界 | `point_outside_screenshot`，文案同 Codex（"is outside screenshot bounds … Take a fresh screenshot before retrying"） |
| 截图失效 | `stale_screenshot` 带同一句 "Take a fresh screenshot before retrying" |
| 优雅关闭 | `close` RPC → helper 落盘后退出 0；插件 dispose 时先发 close 再兜底 kill |
| Esc 语义 | 覆盖层退出码 **130** → helper 写入 `%LOCALAPPDATA%\dsh-computer-use\interrupts\<会话>-<turn>.flag` 并自身退出 130；同 turn 后续调用 `turn_stopped`，新 turn 放行 |
| 音频授权 | 独立于应用授权的一次性确认（Codex: `computer-audio` / "Allow Computer Use to record computer audio?"） |
| 音频返回 | `{ filepath, bytes: base64 WAV, data_url }`，统一 **24 kHz 立体声 16-bit** |
| 音频上限 | 单次录音 ≤ 300 000 ms（Codex 同值），不足 500 ms 自动抬到 500 |
| App 字段 | `isRunning` + `lastUsedDate`（进程启动时间）；`useCount` 无数据来源，按 Codex 的可选字段处理，不伪造 |

marker 文件按 **会话 + turn** 命名，避免旧会话的 Esc 标记误伤新会话。

## 配置示例

```yaml
- insert:
    - id: deepseek-computer-use
      name: 'deepseek-computer-use'
      config:
        approval: sensitive     # never | sensitive | always
        appConsent: session     # 每个应用问一次；never 表示不问
        audio: false            # 开启 WASAPI 环回录音（start/stop_audio_recording）
        redactApps: []          # 这些应用的截图永不出机器，例如 ["1password", "银行"]
        defaultIncludeScreenshot: true
        timeoutMs: 10000        # 单次 RPC 超时（launch_app 用 launchTimeoutMs）
        helperPath: null        # 覆盖 helper 路径（仅信任场景）
        riskyPattern: ''        # 自定义「危险动作」正则，命中走审批
        toolPrefix: ''          # 例如 cu_ 可避免和其他插件的 click 重名
```

## 已知边界

- 只支持 Windows；驱动层是接口（`IPlatformDriver`），macOS / Linux 可照着补。
- Codex window2 没有的接口（`paste` / `clipboard_*` / `key_down` / `move`）这里也没有。
- `App.useCount` 没有数据来源，按可选字段留空，不伪造。
- `redactApps` 在**插件层**执行：直接调用 helper 的 RPC 不受它约束，别把 helper 单独暴露给非受信调用方。
- 抢焦点类工具（如 ProcessLasso）会让 `type_text` 返回 `focus_failed`，这是设计行为——宁可不输入，也不打到别的窗口。

## 插件更新

需要 DSH 0.2.1-rc.3 或更新版本。更新控件直接位于原有工作台内容末尾；没有工作台的插件，位于原生插件详情页底部。检查、更新记录和偏好在原地展开，不增加独立更新页面或设置菜单。自动检查默认开启；**自动安装默认关闭**，明确授权后才会在空闲且没有未保存修改时安装兼容的稳定补丁。开关按插件独立保存，可关闭、推迟或忽略提醒；不会强制重启 DSH、升级 DSH 本体或替换本地源码安装。Suite 组件在当前页面底部明确说明并操作 Suite 整包更新。

旧版用户先在官方插件管理中手动更新一次，之后才会获得此入口。发布到 npm 不会直接替换用户已经安装的版本。

## License

MIT
