# 更新记录

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
