**简体中文** · [English](README.en.md)

# Computer Use

**让 DSH 在授权范围内操作 Windows 应用。**

[![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-total-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use)
[![npm](https://img.shields.io/npm/v/deepseek-computer-use.svg)](https://www.npmjs.com/package/deepseek-computer-use)

**[安装使用](#安装) · [使用流程](#开始使用) · [完整说明](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.zh.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-zh-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-zh-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-zh-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-zh-light.svg" alt="让 DSH 在授权范围内操作 Windows 应用。 · 流程示意" width="100%">
</picture>

## 功能

- 先查看窗口截图或界面控件，再决定下一步。
- 按应用选择本会话允许、始终允许或拒绝，可从侧栏「电脑控制」工作台撤销授权。
- 检查实际结果，保留操作审计与中断能力。
- 在工作台并排查看窗口快照、编号控件和抓屏耗时。工作台提供四种布局，并与 Suite 共用皮肤设置。

## 安装

在 DSH 桌面版「插件」面板安装 `deepseek-computer-use`。已配置命令行时也可使用：

```bash
dsh plugin --profile desktop add deepseek-computer-use
```

网页版把 `desktop` 改为 `web`；安装后重启对应的 DSH。宿主要求以包声明 `>=0.2.2-rc.3` 为准。

## 开始使用

1. 在 Windows 10/11 的实际 DSH profile 中安装 deepseek-computer-use，然后创建新会话。
2. 打开目标软件，并在对话中说明要操作的应用、目标和允许范围。
3. 按提示批准会话应用授权；先让助手查看窗口截图或界面控件，再执行点击和输入。
4. 敏感操作先核对审批内容；失败或结果不明确时重新观察，避免重复提交。
5. 检查软件中的实际结果；需要中断时取消当前任务，插件会停止本次原生助手。

可以这样说：

> 先查看目标应用的窗口和控件，说明下一步计划，暂不点击或输入。

### 工具和直控命令

默认暴露 17 个平铺工具及 CUA 对象桥接。`exposeMode` 可选 `hybrid`、`tools`、`cua`。已挂载 TypeScript PTC 的会话可调用 `cua_run_code`，通过 `cua.getApp(id)` 和 `app.getWindow(windowId)` 取得窗口对象。

指针工具支持 `relative: true`，坐标采用最近观测的客户区千分比整数 `0..999`。窗口平移会重新计算原点，尺寸或 DPI 改变时会返回 `WINDOW_CHANGED`，需要重新观测。`get_window_state` 可用 `region` 裁剪截图。纯文本模型使用 `include_screenshot: false, include_text: true`。

`/cu status` 查看状态，`/cu stop` 停止当前轮次的电脑控制，`/cu restore-cursor` 恢复系统光标，`/cu revoke <应用名或 ID>` 撤销授权。

## 开始前要知道

面向 Windows 10/11；应用权限、控件支持和桌面环境会影响可操作范围。
Helper 与光标覆盖层首次使用时由系统 `csc.exe` 编译，按源码哈希缓存。WGC 和 WASAPI 组件可以单独构建，常规截图支持 PrintWindow 和 BitBlt。

配置、完整工具与排错见[详细使用说明](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.zh.md)。

## 插件更新

在工作台或原生插件详情页底部检查更新。独立安装时按本插件保存更新偏好，默认打开自动检查、关闭自动安装。工作台可并发探测 npmjs 和 npmmirror。Suite 管理的组件随整包更新。[查看更新规则](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.zh.md)。

## 文档

- [详细使用、配置与边界](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.zh.md)
- [更新记录](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/CHANGELOG.md)

## 反馈与贡献

如果插件帮到了你，欢迎 Star，让更多人发现它。问题和建议请提交 [Issues](https://github.com/STARDUSTLC666/deepseek-computer-use/issues)，也欢迎代码与文档 [PR](https://github.com/STARDUSTLC666/deepseek-computer-use/pulls)。反馈时附上版本与复现步骤，并移除凭据。

## License

[MIT](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/LICENSE)

<a id="自检"></a>
<a id="deepseek-harness-接入"></a>
<a id="它解决什么问题"></a>
<a id="架构"></a>
<a id="工具"></a>
<a id="使用中指示器对齐-codex-的两个-overlay"></a>
<a id="安全模型"></a>
<a id="配置"></a>
<a id="与-codex-windows-window2-的关系"></a>
<a id="能力边界"></a>
<a id="抓屏链路对齐-codex-的-wgc"></a>
<a id="已知限制"></a>
<a id="测试"></a>
<a id="许可"></a>
<a id="原生载荷nativebin"></a>
<a id="与-codex-window2-的细节对齐第二轮"></a>
<a id="配置示例"></a>
<a id="已知边界"></a>
