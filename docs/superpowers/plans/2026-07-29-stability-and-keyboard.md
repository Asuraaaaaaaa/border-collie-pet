# LinePuppy Stability And Keyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the global keyboard feature, keep expanded UI inside the active display, fix the confirmed behavior regressions, synchronize version metadata, and add repeatable tests.

**Architecture:** Keep Tauri as the OS integration boundary and convert the frontend scripts to ES modules. Move key listening into a tested Rust module and move geometry and pose decisions into a pure JavaScript module tested with Node's built-in runner.

**Tech Stack:** Tauri 2, Rust 2021, `rdev`, `macos-accessibility-client`, browser ES modules, Node `node:test`, HTML/CSS.

---

## File Structure

- Create `src-tauri/src/keyboard.rs`: key mapping, listener state, permission check, command, and Rust unit tests.
- Modify `src-tauri/src/main.rs`: register keyboard state/command and restore the About alert.
- Modify `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`: macOS accessibility dependency and version.
- Create `src/logic.js`: pure keyboard-layout, monitor, clamping, reset-position, and pomodoro-pose helpers.
- Create `tests/logic.test.js`: Node tests for the pure frontend behavior.
- Rewrite `src/keyboard.js` as an ES module: keyboard DOM, statistics, listener status, retry, and layout callbacks.
- Modify `src/pet.js`: import keyboard/logic APIs and use active-monitor-aware window layouts.
- Modify `src/index.html`: module entry point, keyboard status UI, stable panel CSS.
- Modify `src-tauri/capabilities/default.json`: remove the developer-tools capability.
- Modify `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `FEATURES.md`: tests, version `0.3.0`, and documentation.

### Task 1: Correct And Test Rust Key Mapping

**Files:**
- Create: `src-tauri/src/keyboard.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/keyboard.rs`

- [ ] **Step 1: Add failing mapping tests to the currently compiled module**

Add tests beside the current `key_to_code` in `main.rs` first so the existing broken
patterns are actually compiled and exercised. The table must cover every supported
mapping, grouped across letters, number row, punctuation, modifiers, navigation,
`F1..F12`, and every supported keypad key, plus `None` for `Unknown(1)`.

```rust
#[test]
fn maps_supported_keys_to_browser_codes() {
    let cases = [
        (Key::KeyA, "KeyA"),
        (Key::F1, "F1"),
        (Key::Backspace, "Backspace"),
        (Key::ShiftLeft, "ShiftLeft"),
        (Key::Alt, "AltLeft"),
        (Key::BackSlash, "Backslash"),
        (Key::LeftArrow, "ArrowLeft"),
        (Key::Kp0, "Numpad0"),
    ];
    for (key, expected) in cases {
        assert_eq!(key_to_code(&key).as_deref(), Some(expected));
    }
}
```

- [ ] **Step 2: Run the Rust test and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tests::maps_supported_keys_to_browser_codes -- --exact`

Expected: FAIL with an assertion such as `KeyA` returning `Backspace`; do not accept
"0 tests" or a module/import error as the RED result.

- [ ] **Step 3: Move mapping into `keyboard.rs` with explicit variants**

Move both the full table-driven tests and the implementation into a compiled
`keyboard.rs` module. Implement `pub fn key_to_code(key: &rdev::Key) ->
Option<&'static str>` using `rdev::Key::Backspace`, `ShiftLeft`, `ShiftRight`,
`ControlLeft`, `ControlRight`, `Alt`, `AltGr`, `Kp0..Kp9`, `KpMinus`, `KpPlus`,
`KpMultiply`, `KpDivide`, `KpDelete`, `KpReturn`, and `BackSlash`. Remove the
broken mapping and unused `Arc` import from `main.rs`.

- [ ] **Step 4: Run the complete Rust test suite and confirm GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS with no unreachable-pattern warnings.

- [ ] **Step 5: Commit the mapping fix**

```bash
git add src-tauri/src/main.rs src-tauri/src/keyboard.rs
git commit -m "fix: correct global keyboard mappings"
```

### Task 2: Add Safe On-Demand Global Listener

**Files:**
- Modify: `src-tauri/src/keyboard.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Test: `src-tauri/src/keyboard.rs`

- [ ] **Step 1: Add listener-state tests and reach an assertion RED**

Test that the first `claim_start()` succeeds, a second claim fails, and `release()`
permits a later retry. Test that the listener-error path releases the claim before
returning fallback status. Test JSON serialization for the exact active/fallback
status contract. Add the tests first, then only the minimal compiling type/method
stubs needed to run them; rerun until they fail on behavior assertions. A compiler
error does not count as the RED result.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml keyboard::tests::listener_start_is_idempotent -- --exact`

Expected: FAIL because `KeyboardListenerState` and `KeyboardStatus` do not exist.

- [ ] **Step 3: Implement listener state and the Tauri command**

Add `KeyboardListenerState` backed by `Arc<AtomicBool>`, serializable
`KeyboardStatus { status, reason }`, and `#[tauri::command]
start_keyboard_listener`. On macOS call
`macos_accessibility_client::accessibility::application_is_trusted_with_prompt()`
before claiming the listener. Return permission fallback when false. Start
`rdev::listen` once on a background thread, emit only `global-keydown` key codes,
and route listener termination through the tested release-and-fallback method before
emitting `keyboard-listener-status` with listener-error fallback.

Register `.manage(KeyboardListenerState::default())` and `.invoke_handler(tauri::generate_handler![keyboard::start_keyboard_listener])` in `main.rs`. Remove the unconditional startup error event.

Add the dependency only on macOS:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
macos-accessibility-client = "0.0.2"
```

- [ ] **Step 4: Verify GREEN and warning-free compilation**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS with no project warnings.

- [ ] **Step 5: Commit the listener service**

```bash
git add src-tauri/src/keyboard.rs src-tauri/src/main.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: start global keyboard listener safely"
```

### Task 3: Add Testable Frontend Logic

**Files:**
- Create: `src/logic.js`
- Create: `tests/logic.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the Node test commands**

Add `"test:js": "node --test tests/*.test.js"` and
`"test": "npm run test:js && cargo test --manifest-path src-tauri/Cargo.toml"` to
`package.json`.

- [ ] **Step 2: Add behavior tests and reach an assertion RED**

Use `node:test` and `node:assert/strict`. Test:

- physical monitor work area converts to logical coordinates, including negative origins
- pet positions clamp against `{ x, y, width, height }`
- default position uses current work-area origin and margins
- keyboard layout chooses right when it fits and left near the right edge
- the pet's screen coordinates equal `windowPosition + petOffset`
- configured pomodoro pose is returned unchanged
- listener status transitions (`fallback` to `global`) and duplicate-event policy
- work-interval reset versus menu suspend/resume preserving statistics

Add the tests before production behavior. If the first run fails to load the missing
module/exports, add only behavior-free named-export stubs and rerun until explicit
value assertions fail. Module loading errors do not count as the RED result.

- [ ] **Step 3: Run Node tests and confirm RED**

Run: `npm run test:js`

Expected: FAIL on explicit value assertions from the behavior-free stubs. Module
loading errors do not count as the RED result.

- [ ] **Step 4: Implement pure helpers in `src/logic.js`**

Export `monitorWorkAreaToLogical`, `clampPetPosition`, `defaultPetPosition`, `calculateKeyboardLayout`, and `pomodoroResumePose`. `calculateKeyboardLayout` returns `windowPosition`, `windowSize`, `petOffset`, `panelOffset`, and `overlay`; it prefers right, then left, and clamps against non-zero monitor origins.

Also export a small pure keyboard state reducer/tracker that implements listener
mode transitions, ignores local key events while global mode is active, resets at a
new work interval, and preserves statistics across suspend/resume.

- [ ] **Step 5: Run Node tests and confirm GREEN**

Run: `npm run test:js`

Expected: all tests pass.

- [ ] **Step 6: Commit the pure frontend layer**

```bash
git add src/logic.js tests/logic.test.js package.json package-lock.json
git commit -m "test: cover window and pomodoro logic"
```

### Task 4: Rebuild The Keyboard Controller And Panel

**Files:**
- Modify: `src/keyboard.js`
- Modify: `src/index.html`
- Modify: `src/pet.js`
- Modify: `tests/logic.test.js`

- [ ] **Step 1: Add a completeness test and reach an assertion RED**

Add a test that imports `KEYBOARD_LAYOUT`, asserts the flattened layout is non-empty,
and checks every entry has a non-empty, unique code. Include explicit assertions for
`F1..F12` and `Backslash`. After the expected missing-export error, add only an empty
export and rerun until the non-empty assertion fails; the import error does not count
as the RED result.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:js`

Expected: FAIL on the non-empty/content assertions, not a missing-export error.

- [ ] **Step 3: Convert the frontend entry to modules**

Change the HTML entry to `<script type="module" src="pet.js"></script>`. Rewrite `keyboard.js` to import `KEYBOARD_LAYOUT` and export:

- `configureKeyboardLayout(handler)`
- `showKeyboard({ reset })`
- `hideKeyboard()`
- `suspendKeyboard()` and `resumeKeyboard()`
- `getKeyboardSummary()`
- `setKeyboardPanelRect(rect)`

Register `global-keydown` and `keyboard-listener-status` before invoking `start_keyboard_listener`. Ignore focused-window `keydown` while global mode is active to prevent double counting. Render `global` or `local-fallback` status, fallback reason, and a retry button.

Use a single guarded initialization promise so listeners are registered once across
repeated pomodoro rounds. Drive event counting and reset/suspend/resume through the
tested pure keyboard state helper from Task 3.

Add `#kbStatus` and `#kbRetry` to the panel. Give the panel a stable `340px` width and `220px` height. Keep key dimensions stable and prevent labels from resizing the window.

Update `pet.js` imports and replace direct access to `kbTotal`/`kbKeyMap` with `getKeyboardSummary()`.

- [ ] **Step 4: Verify keyboard tests and syntax**

Run: `npm run test:js && node --check src/logic.js && node --check src/keyboard.js && node --check src/pet.js`

Expected: PASS.

- [ ] **Step 5: Commit the controller and UI**

```bash
git add src/logic.js tests/logic.test.js src/keyboard.js src/pet.js src/index.html
git commit -m "fix: make keyboard panel complete and observable"
```

### Task 5: Make Window Behavior Monitor-Aware

**Files:**
- Modify: `src/pet.js`
- Modify: `src/keyboard.js`
- Modify: `src-tauri/capabilities/default.json`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Add failing edge-case and integration-contract tests**

Add tests not already satisfied by Task 3: a `100px` pet with a `220px` panel, a
maximum `320px` pet, documented overlay mode below `800x600`, panel clamping at a
negative monitor origin, and a source/integration assertion that drag release awaits
monitor refresh before clamping against the new bounds.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:js`

Expected: overlay or integration-contract assertions fail for the missing behavior;
already-green duplicates of Task 3 do not count as RED.

- [ ] **Step 3: Integrate current-monitor work areas**

Change `bounds` to `{ x, y, width, height }`. Add `refreshMonitorBounds()` using
`currentMonitor()` with primary fallback during startup. Convert `monitor.workArea`
through `monitorWorkAreaToLogical`. Preserve the last valid bounds if either window
API fails and report each actionable window error only once.

Use pure helpers for initialization, reset, resizing, walk/run edge collision, and
post-drag clamping. On drag release, first `await refreshMonitorBounds()`, then clamp
against the refreshed bounds, then update the window position. Use `bounds.x`/
`bounds.y` in menu positioning and limit menu height to the current work area.

Centralize normal and keyboard window layouts in `pet.js`. Preserve the pet's desktop coordinates while resizing the window, place the panel via `setKeyboardPanelRect`, suspend the keyboard while the context menu is open, and resume without resetting statistics after close.

- [ ] **Step 4: Run tests and syntax checks**

Run: `npm run test:js && node --check src/keyboard.js && node --check src/pet.js`

Expected: PASS.

- [ ] **Step 5: Commit monitor-aware behavior**

```bash
git add src/logic.js tests/logic.test.js src/keyboard.js src/pet.js src-tauri/capabilities/default.json
git commit -m "fix: keep pet UI inside the active display"
```

### Task 6: Fix About, Pomodoro Pose, And Version Metadata

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/pet.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `FEATURES.md`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Add and run a deterministic pomodoro integration assertion**

Add a Node source-contract test that reads `src/pet.js` and requires the drag-release
path to call `pomodoroResumePose(pomoConfig.pose)` (or an equivalent extracted
integration seam) and rejects the current hard-coded `lockedState = "lying"` /
`enter("lying")` path. Run it before editing production code and confirm the explicit
assertion fails.

- [ ] **Step 2: Apply behavior and product fixes**

Restore `window.alert(...)` in the tray About handler with the approved v0.3.0 text. Remove `core:webview:allow-internal-toggle-devtools`. On pomodoro drag release, restore `pomoConfig.pose`.

Set `0.3.0` in npm, Cargo, Tauri, lockfiles, and `FEATURES.md`. Add a v0.3.0 history entry for keyboard permission handling, key mapping, panel layout, multi-monitor support, tests, and About restoration. Document the keyboard panel in the feature list.

- [ ] **Step 3: Run focused tests and metadata checks**

Run: `npm test`

Run structured version assertions: load `package.json`, `package-lock.json`, and
`src-tauri/tauri.conf.json` with Node and assert their application versions are
`0.3.0`; use `cargo metadata --locked --no-deps` to assert the root package version;
and check only the `FEATURES.md` current-version field. Historical changelog and
dependency versions are intentionally excluded.

Expected: tests pass and every authoritative application version is `0.3.0`.

- [ ] **Step 4: Commit behavior and release metadata**

```bash
git add src-tauri/src/main.rs src-tauri/capabilities/default.json src/pet.js package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json FEATURES.md
git commit -m "fix: align desktop behavior and release metadata"
```

### Task 7: Full Verification And Runtime QA

**Files:**
- Modify only if verification reveals an in-scope defect.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`

Expected: Node and Rust tests pass with zero failures.

- [ ] **Step 2: Run warning and syntax gates**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Run: `node --check src/logic.js && node --check src/keyboard.js && node --check src/pet.js`

Expected: all commands exit 0 with no project warnings.

- [ ] **Step 3: Build the desktop application**

Run: `npm run tauri -- build --debug --no-bundle`

Expected: exit 0 and a debug executable at `src-tauri/target/debug/line-puppy-pet`.

- [ ] **Step 4: Perform manual runtime checks**

Run `npm run dev` and verify: permission fallback appears without a crash; retry transitions to global mode after authorization; typing in another application updates counts; F-keys highlight; the panel stays visible at 100px and 320px pet sizes; dragging to another display updates movement bounds; configured pomodoro pose resumes; About shows the approved copy.

Also verify repeated work rounds do not double-count one key press, opening and
closing the context menu preserves the current round statistics, and a simulated or
observed listener-error state exposes retry and can start again.

- [ ] **Step 5: Inspect final repository state**

Run: `git status --short --branch && git log --oneline -10`

Expected: only intentional implementation commits are present and no uncommitted generated artifacts remain.
