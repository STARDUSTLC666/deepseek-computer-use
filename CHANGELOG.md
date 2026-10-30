# 更新记录

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
