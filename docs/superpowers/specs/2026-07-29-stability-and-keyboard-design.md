# LinePuppy Stability And Keyboard Design

## Goal

Make the existing global keyboard, window layout, pomodoro, tray, multi-monitor, versioning, and test behavior reliable without replacing the Tauri 2 plus native JavaScript architecture.

## Scope

This work covers the eight confirmed issues from the project analysis:

1. Global keyboard listening is currently disabled.
2. Several `rdev::Key` patterns are invalid and capture unrelated keys.
3. The virtual keyboard lacks valid codes for function keys.
4. The keyboard panel can extend beyond the display and be vertically clipped.
5. The tray About action opens developer tools.
6. Dragging during a pomodoro restores the wrong pose.
7. Pet movement and reset logic assume the primary display starts at `(0, 0)`.
8. Application versions and the feature document disagree, and the affected behavior has no automated tests.

The work does not add new pet animations, redesign the sprite pipeline, replace the battery API, or convert the app to the Codex pet atlas format.

## Architecture

The existing Tauri backend remains responsible for OS integration. The browser frontend remains responsible for the pet state machine and UI. Pure calculations that currently depend on mutable DOM state will move into a small ES module so they can be tested with Node's built-in test runner.

The frontend scripts will become ES modules. `pet.js` will import the keyboard controller instead of reading its globals, and both will import pure helpers from `logic.js`. No frontend framework or test dependency will be added.

## Global Keyboard Service

The backend will expose an idempotent `start_keyboard_listener` command. The frontend calls it when the keyboard panel is shown, after event listeners are registered, which avoids losing startup status events.

On Windows, the command starts the existing `rdev` listener on a background thread. On macOS, it first uses the native accessibility trust check with the system prompt enabled. If access is missing, it returns `permission-required` without starting `rdev`; the frontend continues with focused-window key events and offers a retry control. Once permission is granted, retrying starts the listener without requiring an application restart when the OS allows it.

The listener is guarded by atomic state so repeated pomodoro rounds cannot create duplicate hooks. Listener failure clears that state and emits a status event. Only physical key identifiers are emitted; typed characters and composed text are never captured.

`key_to_code` will use explicit, valid `rdev::Key` variants and return static strings. Unit tests will cover letters, modifiers, function keys, punctuation, navigation keys, and keypad keys, as well as an intentionally unmapped key.

## Keyboard UI And Layout

The backend command and status event use the same payload contract:

- `{ status: "active", reason: null }` means the global listener is running.
- `{ status: "fallback", reason: "permission-required" }` means macOS accessibility access is missing.
- `{ status: "fallback", reason: "listener-error" }` means the OS listener failed to start or stopped unexpectedly.

The panel has two mutually exclusive operating modes: `global` and `local-fallback`. In `local-fallback`, focused-window `keydown` events continue to update statistics, while `reason` controls the explanatory text. Permission and listener-error fallbacks both expose a retry button. Retry invokes the same idempotent backend command; success transitions to `global`, while another fallback response updates the reason without creating another listener.

Every virtual key will have a valid browser `KeyboardEvent.code`.

Keyboard statistics remain session-scoped to the current pomodoro work interval. The keyboard module will export show, hide, and summary functions rather than exposing mutable global variables.

The panel gets a fixed `340x220px` preferred size independent of pet size, which fits the six keyboard rows, statistics, status, and top-key summary at the existing font sizes. A pure layout function receives the current pet position, pet size, panel size, and current monitor work area. It prefers placing the panel to the right, uses the left when the right side does not fit, bottom-aligns the pet when the panel is taller, and clamps the full window to the work area as a final fallback. The pet's screen position remains stable while the window expands and contracts whenever the work area has enough room for the combined surface.

The supported desktop work area is at least `800x600` logical pixels, which accommodates the maximum `320px` pet beside the `340px` panel. On a smaller work area, the panel remains `340x220px`, the surface is clamped to the work area origin, and the pet may be temporarily overlaid by the panel while the keyboard is visible. The persisted pet size is not changed. This is an explicit degradation mode for unusually small or heavily scaled displays.

Opening the context menu temporarily hides the keyboard panel without resetting its statistics. Closing the menu restores the correct expanded layout when a pomodoro work interval is still active.

## Multi-Monitor Behavior

Monitor geometry will use Tauri's `currentMonitor()` result and its `workArea`, converted from physical to logical coordinates using the monitor scale factor. Bounds include work-area origin as well as size.

After initialization and after a manual drag, the frontend refreshes the active monitor. Walking and running clamp against that monitor's logical work area. Reset places the pet near the lower-right of the current monitor rather than the primary monitor. Resizing also clamps the pet so it cannot become stranded off-screen.

If monitor lookup fails, the last known bounds remain active; at startup only, the primary monitor is the fallback.

## Behavior Corrections

The tray About action will call `window.eval(...)` with a browser-native `window.alert(...)`; it adds no dialog dependency and reuses the main webview. Its authoritative copy is:

```text
边牧桌宠 v0.3.0

一只住在桌面上的小边牧。
左键点击：互动
按住拖拽：移动
滚轮：调整大小
右键：打开功能菜单
```

The release capability for toggling developer tools will be removed.

When a pet is dragged during a pomodoro work interval, releasing it restores `pomoConfig.pose` rather than hard-coding `lying`.

## Versioning And Documentation

The npm package, Cargo package, Tauri config, and feature document will all move to `0.3.0`. The feature history will describe the virtual keyboard, permission behavior, multi-monitor layout, and reliability fixes. `Cargo.lock` will be updated by Cargo.

## Testing

Rust unit tests verify every supported key mapping and ensure unsupported keys return `None`.

Node tests verify:

- keyboard panel placement on the right and left edges of displays
- clamping with non-zero and negative monitor origins
- stable pet screen position during panel expansion
- default/reset position within a monitor work area
- pomodoro drag restoration uses the configured pose

The root `npm test` command runs the Node suite and Cargo tests. Completion also requires clean JavaScript syntax checks, a warning-free `cargo check`, and a Tauri debug no-bundle build.

## Error Handling And Privacy

OS permission denial is a normal fallback state, not an application error. Listener startup failures are surfaced in the panel without preventing pomodoro use. Window API failures keep the last valid geometry and log one actionable message.

The global listener never persists key events, never captures text values, and never transmits statistics outside the local application.

## Acceptance Criteria

- A permitted macOS or Windows installation counts key presses while another application is focused.
- A macOS installation without accessibility permission remains stable and shows an authorization/retry state.
- Rust builds without unreachable-pattern or unused keyboard-listener warnings.
- Every displayed virtual key can be highlighted by its browser or backend code.
- On supported work areas of at least `800x600` logical pixels, the full keyboard panel remains inside the active display work area at pet sizes from 100px through 320px. Smaller work areas use the documented overlay degradation without changing the saved pet size.
- Dragging the pet to another display keeps subsequent movement, reset, menu, and keyboard layout on that display.
- Pomodoro drag release restores the configured pose.
- About no longer opens developer tools.
- All visible version declarations read `0.3.0`.
- Automated tests and the Tauri debug build pass.
