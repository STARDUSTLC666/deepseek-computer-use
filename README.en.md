# deepseek-computer-use

[中文](README.md)

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

Requires Windows 10/11, Node.js 22.19+ (22.x) or 24+, and DSH 0.2.1-rc.3 or newer. In Desktop, install the package below from the native Plugins panel. For Web:

```bash
dsh plugin --profile web add deepseek-computer-use
```

Restart the host after installation. This package operates the Windows computer running DSH; a remote browser does not move execution to the viewer's computer.

## Use

Start a task that needs a desktop app. Observe the window and controls before acting, and grant access to the intended app for the session. The 16 tools cover window discovery, screenshots, mouse and keyboard, UI Automation controls and optional system audio recording.

The native helper uses Windows UI Automation, SendInput and Windows.Graphics.Capture. Cancellation or the end of a turn stops its helper; failed actions require a fresh observation before retrying. Approval-required operations refuse when the host cannot ask. This is not an operating-system sandbox for untrusted applications.

## Safety and recovery

Actions pass these gates in order, and each refusal returns its own error code: hard denials that approval cannot override (terminals, Run dialog, credential and security UIs, authentication dialogs, the DSH host, the Windows/Meta key family); `allowApps` / `denyApps` reachability; one consent prompt per app per session (`appConsent`); action confirmation via DSH's approval seam (`approval`, which refuses with `approval_unavailable` when no approval service is mounted); and `redactApps`, whose screenshots never leave the machine.

The plugin never retries an input whose outcome is unknown: it clears cached snapshots and asks for a fresh observation. Run `computer_use_health` first, then use the error-code table in the [Chinese guide](README.md#失败与恢复) for the recovery step of `hard_denied`, `app_not_approved`, `focus_failed`, `window_minimized`, `stale_screenshot`, `fresh_observation_required`, `cancelled_by_user` / `turn_stopped` and `protocol_mismatch`.

The bundled `computer-use-windows` skill holds the operator playbook (observation loop, action choice, failure moves); ask the assistant to load it for harder desktop tasks.

## Updates

Version controls are at the bottom of native plugin details. Automatic checks are on; automatic installation is off by default. Installation, deferral and update preferences remain user choices. The plugin does not force a DSH restart.

## Documentation and feedback

See the [Chinese guide](README.md) for the complete tool list, configuration, native payload requirements and platform limitations, and the [changelog](CHANGELOG.md) for releases.

Feedback and contributions are welcome: report [issues](https://github.com/STARDUSTLC666/deepseek-computer-use/issues) or submit [pull requests](https://github.com/STARDUSTLC666/deepseek-computer-use/pulls). Include versions, expected and actual behavior, and redact private screenshots or credentials.

## License

[MIT](LICENSE).
