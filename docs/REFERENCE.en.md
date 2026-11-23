> Full usage reference. The landing page focuses on outcomes, installation and workflows; detailed parameters, limits, update rules and historical validation links remain here.

# deepseek-computer-use

[中文](./REFERENCE.zh.md)

[![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-total-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use)

[Download statistics](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

Let DeepSeek Harness operate Windows desktop apps: discover windows, inspect screenshots and UI controls, then use mouse and keyboard actions. Designed for GUI tasks without a suitable API, with per-session app consent, sensitive-action confirmation and audit records.

Community plugin, not an official DeepSeek product.

## Start using it

1. Install deepseek-computer-use in your Windows 10/11 DSH profile, then start a new session.
2. Open the target application and describe the app, goal and allowed scope in the conversation.
3. Approve the session application access when prompted; inspect the window or controls before clicking and typing.
4. Review approval details for sensitive actions; re-observe after failures or uncertain results instead of submitting twice.
5. Check the result in the application. Cancel the task to stop its native helper when needed.

## Install

Requires Windows 10/11, Node.js 22.19+ (22.x) or 24+, and DSH 0.2.2-rc.3 or newer. In Desktop, install the package below from the native Plugins panel. For Web:

```bash
dsh plugin --profile web add deepseek-computer-use
```

Restart the host after installation. This package operates the Windows computer running DSH; a remote browser does not move execution to the viewer's computer.

## Use

Start a task that needs a desktop app. Observe the window and controls before acting, and grant access to the intended app for the session. The 17 flat tools and the CUA object bridge cover window discovery, screenshots, mouse and keyboard, UI Automation controls and optional system audio recording.

The native helper uses Windows UI Automation, SendInput and Windows.Graphics.Capture. Cancellation or the end of a turn stops its helper; failed actions require a fresh observation before retrying. Approval-required operations refuse when the host cannot ask. This is not an operating-system sandbox for untrusted applications.

## Updates

Requires DSH 0.2.2-rc.3 or newer. Update controls sit at the bottom of the Computer Use workbench as well as native plugin details. Checks, release notes and preferences expand in place, with no separate update page or settings menu. Automatic checks are on by default; **automatic installation is off by default**. Only explicit opt-in permits compatible stable updates (compatible minor and patch releases by default, or patch-only) while idle with no unsaved changes. Installation, deferral, ignore and update preferences remain user choices. The plugin does not force a DSH restart or upgrade, and local-source installations stay unchanged.

## Documentation and feedback

See the [Chinese reference](./REFERENCE.zh.md) for the complete tool list, configuration table, safety gates, error-code recovery table, native payload requirements and platform limitations, the bundled skill [computer-use-windows](../skills/computer-use/SKILL.md) for agent workflow guidance, and the [changelog](../CHANGELOG.md) for releases.

Feedback and contributions are welcome: report [issues](https://github.com/STARDUSTLC666/deepseek-computer-use/issues) or submit [pull requests](https://github.com/STARDUSTLC666/deepseek-computer-use/pulls). Include versions, expected and actual behavior, and redact private screenshots or credentials.

## License

[MIT](../LICENSE).
