---
name: computer-use-windows
description: Drive Windows desktop apps through DSH Computer Use tools (UIA observation, window capture, click/type/key/scroll/drag). Load when a task must operate a GUI application, not a shell.
---

# Computer Use (Windows)

The `dsh-computer-use-windows` plugin exposes the Codex window2 API on Windows.
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
- Pass that `screenshotId` to `click`/`scroll`/`drag` when you are aiming at
  coordinates inside a specific screenshot (a menu popup, for example).
- The runtime waits ~1s after an action before the next capture, so you rarely need
  your own sleeps.
- Screenshot pixels are the coordinate space you click in. For DPI-virtualized apps
  (many older WinForms/Win32 programs) the returned image is already cropped to the
  painted area and the plugin converts screenshot pixels to physical screen pixels
  internally — never scale the coordinates yourself.

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

Additionally: an app must be approved once per session before Computer Use drives
it, and any action whose target label looks irreversible (delete, uninstall, pay,
submit, publish, install, 删除, 卸载, 支付, 提交 …) asks for confirmation.

# Failure playbook

| Symptom | Meaning | Move |
|---|---|---|
| `stale_snapshot` | element indexes expired | `get_window_state include_text:true` again |
| `stale_screenshot` | coordinate screenshot expired | observe again and use the new id |
| `window_gone` | app closed / handle changed | `list_windows` again |
| `window_minimized` | nothing to observe | `activate_window`, then observe |
| `focus_failed` | another window holds the foreground | stop, ask the user; do not retry in a loop |
| `screen_locked` | the desktop is locked (LockApp) | stop and ask the user to unlock |
| `hard_denied` | the surface is never automatable | tell the user, do not route around it |
| `turn_ended` | the turn is over | wait for the user to continue |
| empty tree | Electron/Canvas surface | observe with the screenshot and act by coordinates |
