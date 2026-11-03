[简体中文](README.md) · **English**

# Computer Use

**Let DSH work with Windows apps within your approval.**

[![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-computer-use-total-downloads.svg)](https://www.npmjs.com/package/deepseek-computer-use)

**[Install](#install) · [Workflow](#start-using-it) · [Full guide](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.en.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-en-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-en-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-en-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/deepseek-computer-use/main/docs/assets/intro/workflow-en-light.svg" alt="Let DSH work with Windows apps within your approval. · workflow illustration" width="100%">
</picture>

## Features

- Inspect a screenshot or UI controls before the next step.
- Limit actions through session-level application approval.
- Check the result and keep audit and cancellation controls.

## Install

Open **Plugins** in the DSH desktop app and install `deepseek-computer-use`. If the CLI is available:

```bash
dsh plugin --profile desktop add deepseek-computer-use
```

For the web profile, replace `desktop` with `web`. Restart that DSH profile after installation. The package’s DSH requirement is `>=0.2.1-rc.3`.

## Start using it

1. Install deepseek-computer-use in your Windows 10/11 DSH profile, then start a new session.
2. Open the target application and describe the app, goal and allowed scope in the conversation.
3. Approve the session application access when prompted; inspect the window or controls before clicking and typing.
4. Review approval details for sensitive actions; re-observe after failures or uncertain results instead of submitting twice.
5. Check the result in the application. Cancel the task to stop its native helper when needed.

Example request：

> Inspect the target app window and controls, then explain the next step without clicking or typing.

## Before you start

For Windows 10/11. Permissions, control support and the desktop environment affect what can be automated.

Configuration, detailed tools and troubleshooting: [full reference](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.en.md).

## Plugin updates

Check updates at the bottom of the workbench or native plugin details. Automatic checks are on by default; **automatic installation is off**. You choose whether to install and when to restart. Suite-managed components update with their bundle. [Update behavior](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.en.md).

## Documentation

- [Full usage, configuration and limits](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/docs/REFERENCE.en.md)
- [Release notes](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/CHANGELOG.md)

## Feedback and contributions

If the plugin helps, a Star makes it easier for others to discover. Report problems or suggest improvements in [Issues](https://github.com/STARDUSTLC666/deepseek-computer-use/issues); code and documentation [PRs](https://github.com/STARDUSTLC666/deepseek-computer-use/pulls) are welcome. Include versions and reproduction steps, and remove credentials from reports.

## License

[MIT](https://github.com/STARDUSTLC666/deepseek-computer-use/blob/main/LICENSE)

<a id="use"></a>
<a id="updates"></a>
<a id="documentation-and-feedback"></a>
