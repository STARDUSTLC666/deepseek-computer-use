# Codex Computer Use 源码参考与 DSH 插件复用评估

核查日期：2026-10-18。范围为本机 `@oai/sky@0.7.8` 的 Windows JavaScript SDK、
类型声明，以及 Computer Use 插件 `26.1013.40934` 的清单和操作指南。
Codex 一侧仅做静态审查，没有执行其 helper，也没有获得完整原生驱动源码。
下列三项改进已在本插件中独立实现，并增加了回归和真实 DSH 验收。

## 结论

保留现有 DSH 原生驱动。优先独立实现生命周期、超时恢复和目标校验，
不将本机 Codex SDK 或二进制作为本插件的分发依赖。
这些改进有助于减少失控和误操作；不能据此认定模型任务成功率达到 Codex。

## 能否直接拿代码使用

| 来源 | 核查结果 | 决策 |
|---|---|---|
| 公共 `openai/codex` 仓库 | [LICENSE](https://github.com/openai/codex/blob/main/LICENSE) 为 Apache-2.0 | 具体文件在其授权范围内时，可按该许可证的通知和分发要求评估复用；不把它的授权扩展到桌面组件 |
| 本机 Computer Use 插件 | `.codex-plugin/plugin.json` 的 `license` 为 `Proprietary` | 没有直接复制到本 MIT 项目的授权依据 |
| 本机 `@oai/sky@0.7.8` 包 | `package.json` 未声明开放许可证，包内未发现 LICENSE/NOTICE；可读文件主要是发布后的 JS 和类型声明 | 不把可读或已安装视为开源授权 |
| Windows 原生驱动 | 本次检查未发现 C/C++/C#/Swift 源文件 | 不能宣称已审阅或可直接移植完整原生实现 |

直接导入 SDK 也无法自动补齐 DSH 宿主。Windows 客户端会使用 Codex 的会话/回合元数据、
应用授权信息、审批 elicitation，以及可选的 `nodeRepl.nativePipe`。
其中一条进程启动路径可独立启动 helper，但审批仍要求相应宿主支持；
不能由此推导它在 DSH 中可直接运行，更不能绕过这些授权要求。

## 值得独立实现的差距

| 优先级 | 观察到的机制 | 当前 DSH 插件状态 | 下一步验证 |
|---|---|---|---|
| 已补 | 请求超时后终止旧 helper | bridge 等待协作停止或终止进程，确认退出后报告失败；重启后重新握手 | 可控 helper 覆盖协作/无响应超时、取消、进程退出、畸形响应和队列隔离 |
| 已补 | 回合结束时主动通知运行时 | 监听 DSH `session/event` 的 `turn/end`，立即停止该会话 helper；覆盖层也监测所属 helper 的存活状态 | 真实 DSH 在无后续调用时验证 helper、覆盖层均退出；回归另覆盖执行中的回合结束和排队请求拒绝 |
| 已补 | 失败后重新观察；长输入能中止 | 清除原生与 JS 缓存，要求重新观察；输入循环检查取消并在 finally 释放已按下的键/按钮；截图 id 跨进程唯一 | 真实测试窗覆盖失败后拦截旧操作、重新观察恢复，以及已开始的长文本输入中途取消后不再继续 |
| 中 | 指南区分目标窗口未占据点击位置与一般焦点失败，并要求重新观察 | 原生坐标动作激活窗口，但未发现 `WindowFromPoint` 一类点击位置归属校验 | 用测试窗和自有遮挡窗口验证；确认点击确实位于目标或允许的关联弹窗，否则拒绝 |
| 中 | SDK 校验助手返回的窗口、截图和无障碍字段形状 | DSH 参数已做 JSON Schema 校验，但返回结构仍主要由宽松 output schema 接受 | 注入缺失截图 id、非法尺寸和异常窗口数据，确认不会缓存可继续操作的无效状态 |

表中的机制来自可读 SDK、清单或操作指南；指南描述不能替代原生实现源码。
两个中优先级项目仍是后续审查项，本次未实现；未把它们计入通过结果。

## 已有验证的边界

新增回归为 18 项，另有 WinForms 集成测试。
DSH `0.2.1-rc.2` 与 `0.2.1-alpha.5` 的下列真实宿主验收均通过，长文本取消未跳过。
`test/harness.mjs` 通过真实 DSH CLI/profile 验证截图附件、文本修改、点击、审批审计、
会话隔离、失败后重新观察、长文本中途取消、helper 重建和无后续调用时的回合清理。
当前仍不包含遮挡窗口、多应用长任务、音频录制或与 Codex 的模型任务成功率对比；
实际长拖动和组合键的取消释放未单独进行 GUI 验收。

## 本次证据位置

- `computer-use/26.1013.40934/.codex-plugin/plugin.json`：许可证和 Stop/Interrupt 钩子。
- `@oai/sky@0.7.8/package.json`：版本、入口和依赖。
- `@oai/sky/.../targets/windows/internal/computer_use_client.js`：宿主 native pipe 与审批依赖。
- `@oai/sky/.../targets/windows/internal/computer_use_client_base.js`：输入和输出校验、截图交付。
- `@oai/sky/.../targets/windows/internal/helper_transport.js`：请求预算、超时终止、授权与回合信息。
- `computer-use/26.1013.40934/docs/guidance.md`：失败恢复、重新观察与目标窗口选择。
- 本项目：`lib/bridge.js`、`lib/index.js`、`native/Driver.cs`、`test/harness.mjs`。

本文只记录观察结果和独立实现方向，不包含上述专有组件的源码摘录。
