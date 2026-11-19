---
name: computer-use-windows
description: Drive Windows desktop apps through DSH Computer Use tools (UIA observation, window capture, click/type/key/scroll/drag). Load when a task must operate a GUI application, not a shell.
---

# Computer Use (Windows)

The `deepseek-computer-use` plugin provides Windows desktop tools for DSH,
using window2-style action and observation semantics.
Prefer shell, files and web tools whenever they can do the job: GUI automation is
the slowest, most fragile option and it moves the user's real mouse and keyboard.

## The loop

```text
list_apps / list_windows      find the target, note its id
   |
get_window_state              screenshot by default; ask include_text for indexes
   |
one action                    click / type_text / press_key / scroll / drag / set_value
   |
get_window_state              observe again and VERIFY before continuing
```

# Observation

- `get_window_state({window})` captures a **screenshot by default** and returns
  `accessibility: null`. That is the right default for Electron, Canvas and games.
- Ask `include_text: true` when you need numbered elements. Element indexes belong
  to that one observation; any action that changes the layout invalidates them.
- `screenshots` is an **array**: the window plus related transient UI (open menus,
  tooltips) each with `id`, `zIndex`, `originX`/`originY`, size.
- Pass that `screenshotId` to `click`/`scroll`/`drag`/`mouse_move` when you are aiming at
  coordinates inside a specific screenshot (a menu popup, for example).
- The runtime waits ~1s after an action before the next capture, so you rarely need
  your own sleeps.
- Screenshot pixels are the coordinate space you click in. For DPI-virtualized apps
  (many older WinForms/Win32 programs) the returned image is already cropped to the
  painted area and the plugin converts screenshot pixels to physical screen pixels
  internally — never scale the coordinates yourself.
- Use `relative: true` with integer coordinates `0..999` for the observed client
  area. Observe with UIA or a screenshot first. A new observation is required
  after `WINDOW_CHANGED`. Use `region: {x, y, width, height}` to capture part
  of the window frame in physical pixels.

## CUA objects in PTC

Use `cua_run_code` when the Harness TypeScript runtime is mounted. In ordinary
`run_code`, use the CUA bridge initialization printed in the system prompt.

```js
const apps = await cua.listApps();
const app = await cua.getApp(appId); // exact ID from apps
const win = await app.getWindow((await app.getWindows())[0].id);
const state = await win.getAccessibilityTree({ details: true });
await inspect(state.tree);
// For a model route with image input:
await inspect(await win.getScreenshot({ region: { x: 0, y: 0, width: 320, height: 240 } }));
```

Use `win.click`, `win.mouseMove`, `win.drag`, `win.scroll`, `win.type` and
`win.pressKey` for the selected window. A revoked application requires a new
selection and authorization. Set `useSystemPointer: true` on `mouseMove` to
request a system-pointer hover. Without it, Windows reports the resolved position
with `dispatched: false` because UIA has no general hover operation.

# Choosing an action

| Goal | Tool | Why |
|---|---|---|
| Press a named button | `click` with `element_index` | Uses the semantic Invoke when available; survives occlusion |
| Aim at a pixel | `click` with `x`/`y` (+ `screenshotId`) | Coordinates are in that screenshot's space |
| Fill a field | `set_value` | One call, no focus dance, no keystroke race |
| Type into the focus | `type_text` | Layout-independent Unicode; CJK safe |
| Shortcut | `press_key` `Control_L+s` | X keysym names, KP_0 / Numpad_0 aliases supported |
| Scroll a pane | `scroll` with `x`, `y` | x/y are required; click the pane first if it needs focus |

# While the agent is acting

While the agent works, a breathing accent border and a virtual cursor show what it is doing, with a "DSH 正在使用您的电脑 / Esc 取消" chip.
The user can press Esc at any moment:

- the first call after Esc fails with `cancelled_by_user`
- every further Computer Use call **in the same turn** fails fast with `turn_stopped`

Both mean the same thing: stop working, send a final message noting the user
stopped Computer Use, and do not retry — the block lifts only in a new turn.

# Safety: what is refused outright

These are hard denials. User approval cannot override them.

- Terminals and shells (Windows Terminal, cmd, PowerShell, WSL, mintty), the Run
  dialog, and console window classes.
- Password managers and credential UIs; Windows Security / anti-malware apps;
  UAC and authentication dialogs.
- The agent's own host app (and other assistant apps).
- The Windows / Meta / Super key family, alone or in any chord.

An app needs a session or persistent grant before Computer Use drives it.
An action whose target label looks irreversible (delete, uninstall, pay,
submit, publish, install, 删除, 卸载, 支付, 提交 …) asks for confirmation.

# Failure playbook

| Symptom | Meaning | Move |
|---|---|---|
| `stale_snapshot` | element indexes expired | `get_window_state include_text:true` again |
| `stale_screenshot` | coordinate screenshot expired | observe again and use the new id |
| `WINDOW_CHANGED` | window was resized, changed DPI or changed owner | observe again before using any coordinates |
| `MODEL_DOES_NOT_SUPPORT_IMAGES` | current route accepts text only | use `get_window_state({window, include_screenshot: false, include_text: true})` |
| `APP_ACCESS_REVOKED` | the retained application or window handle lost authorization | select the application again and obtain a fresh grant |
| `fresh_observation_required` | an earlier input or capture failed | observe again; discard every old index, screenshot id and coordinate before deciding the next action |
| `timeout` | the old helper was stopped and its snapshots discarded | take a fresh observation; never repeat an input whose outcome is unknown |
| `cancelled` / `turn_ended` | the active native request was stopped | stop issuing input and wait for a new turn |
| `window_gone` | app closed / handle changed | `list_windows` again |
| `window_minimized` | nothing to observe | `activate_window`, then observe |
| `focus_failed` | another window holds the foreground | stop, ask the user; do not retry in a loop |
| `screen_locked` | the desktop is locked (LockApp) | stop and ask the user to unlock |
| `hard_denied` | the surface is never automatable | tell the user, do not route around it |
| empty tree | Electron/Canvas surface | observe with the screenshot and act by coordinates |
