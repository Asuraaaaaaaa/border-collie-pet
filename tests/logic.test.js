import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as logic from "../src/logic.js";

import {
  KEYBOARD_LAYOUT,
  applyKeyboardStatus,
  calculateKeyboardLayout,
  clampPetPosition,
  countRecentKeyPresses,
  createKeyboardState,
  defaultPetPosition,
  monitorWorkAreaToLogical,
  pomodoroResumePose,
  recordKeyboardEvent,
  resetKeyboardState,
  setKeyboardSuspended,
} from "../src/logic.js";

test("gives every displayed keyboard key a unique browser code", () => {
  const keys = KEYBOARD_LAYOUT.flat();
  assert.ok(keys.length > 0, "keyboard layout must not be empty");

  const codes = keys.map(([, code]) => code);
  for (const [label, code] of keys) {
    assert.equal(typeof code, "string", `${label} must have a string code`);
    assert.notEqual(code.trim(), "", `${label} must have a non-empty code`);
  }
  assert.equal(new Set(codes).size, codes.length, "keyboard codes must be unique");

  for (let index = 1; index <= 12; index += 1) {
    assert.ok(codes.includes(`F${index}`), `F${index} must have an explicit code`);
  }
  assert.ok(codes.includes("Backslash"));
});

test("converts a physical work area with a negative origin to logical coordinates", () => {
  assert.deepEqual(
    monitorWorkAreaToLogical({
      scaleFactor: 2,
      workArea: {
        position: { x: -2880, y: 40 },
        size: { width: 2880, height: 1760 },
      },
    }),
    { x: -1440, y: 20, width: 1440, height: 880 },
  );
});

test("clamps a pet inside a work area with a non-zero origin", () => {
  assert.deepEqual(
    clampPetPosition(
      { x: -2000, y: 1000 },
      160,
      { x: -1440, y: 20, width: 1440, height: 880 },
    ),
    { x: -1440, y: 740 },
  );
});

test("places the default pet relative to the current work-area origin", () => {
  assert.deepEqual(
    defaultPetPosition(
      { x: 1920, y: 23, width: 1920, height: 1057 },
      160,
    ),
    { x: 3560, y: 830 },
  );
});

test("places the keyboard bubble above the pet when it fits", () => {
  const layout = calculateKeyboardLayout({
    petPosition: { x: 500, y: 500 },
    petSize: 160,
    panelSize: { width: 260, height: 170 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  });

  assert.equal(layout.placement, "above");
  assert.deepEqual(layout.windowPosition, { x: 450, y: 322 });
  assert.deepEqual(layout.windowSize, { width: 260, height: 338 });
  assert.deepEqual(layout.petOffset, { x: 50, y: 178 });
  assert.deepEqual(layout.panelOffset, { x: 0, y: 0 });
  assert.equal(layout.pointerOffset, 130);
  assert.equal(layout.overlay, false);
});

test("positions the keyboard bubble against the pet's visible bounds", () => {
  const layout = calculateKeyboardLayout({
    petPosition: { x: 500, y: 500 },
    petSize: 160,
    petInsets: { top: 60, right: 8, bottom: 20, left: 8 },
    panelSize: { width: 260, height: 170 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  });

  assert.equal(layout.placement, "above");
  assert.deepEqual(layout.windowPosition, { x: 450, y: 382 });
  assert.deepEqual(layout.windowSize, { width: 260, height: 278 });
  assert.deepEqual(layout.petOffset, { x: 50, y: 118 });
  assert.deepEqual(layout.panelOffset, { x: 0, y: 0 });
  assert.equal(layout.pointerOffset, 130);
  assert.equal(layout.overlay, false);
});

test("places the keyboard bubble below the pet near the top edge", () => {
  const layout = calculateKeyboardLayout({
    petPosition: { x: 100, y: 10 },
    petSize: 160,
    panelSize: { width: 260, height: 170 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  });

  assert.equal(layout.placement, "below");
  assert.deepEqual(layout.windowPosition, { x: 50, y: 10 });
  assert.deepEqual(layout.windowSize, { width: 260, height: 338 });
  assert.deepEqual(layout.petOffset, { x: 50, y: 0 });
  assert.deepEqual(layout.panelOffset, { x: 0, y: 168 });
  assert.equal(layout.pointerOffset, 130);
  assert.equal(layout.overlay, false);
});

test("places the keyboard bubble beside the pet when vertical space is tight", () => {
  const layout = calculateKeyboardLayout({
    petPosition: { x: 100, y: 70 },
    petSize: 160,
    panelSize: { width: 260, height: 170 },
    workArea: { x: 0, y: 0, width: 800, height: 300 },
  });

  assert.equal(layout.placement, "right");
  assert.deepEqual(layout.windowPosition, { x: 100, y: 65 });
  assert.deepEqual(layout.windowSize, { width: 428, height: 170 });
  assert.deepEqual(layout.petOffset, { x: 0, y: 5 });
  assert.deepEqual(layout.panelOffset, { x: 168, y: 0 });
  assert.equal(layout.pointerOffset, 85);
  assert.equal(layout.overlay, false);
});

test("keeps the bubble and pet inside a work area with a negative origin", () => {
  const workArea = { x: -1440, y: 20, width: 800, height: 600 };
  const layout = calculateKeyboardLayout({
    petPosition: { x: -1400, y: 200 },
    petSize: 320,
    panelSize: { width: 260, height: 170 },
    workArea,
  });

  assert.equal(layout.placement, "above");
  assert.deepEqual(layout.windowPosition, { x: -1400, y: 22 });
  assert.deepEqual(layout.windowSize, { width: 320, height: 498 });
  assert.deepEqual(layout.petOffset, { x: 0, y: 178 });
  assert.deepEqual(layout.panelOffset, { x: 30, y: 0 });
  assert.equal(layout.pointerOffset, 130);
  assert.ok(layout.windowPosition.x >= workArea.x);
  assert.ok(
    layout.windowPosition.x + layout.windowSize.width
      <= workArea.x + workArea.width,
  );
});

test("expands fixed panels to fit Windows text and control metrics", () => {
  assert.equal(typeof logic.resolvePanelSize, "function");
  assert.deepEqual(
    logic.resolvePanelSize(
      {
        clientWidth: 258,
        clientHeight: 168,
        offsetWidth: 260,
        offsetHeight: 170,
        scrollWidth: 310,
        scrollHeight: 202,
      },
      { width: 260, height: 170 },
      { width: 360, height: 240 },
    ),
    { width: 312, height: 204 },
  );
});

test("keeps the pet stationary when an adaptive menu is clamped at an edge", () => {
  assert.equal(typeof logic.calculateMenuLayout, "function");
  const layout = logic.calculateMenuLayout({
    petPosition: { x: 640, y: 400 },
    petSize: 160,
    petInsets: { top: 28, right: 12, bottom: 10, left: 25 },
    menuSize: { width: 280, height: 300 },
    workArea: { x: 0, y: 0, width: 800, height: 600 },
  });

  assert.equal(layout.placement, "above");
  assert.deepEqual(layout.windowPosition, { x: 520, y: 120 });
  assert.deepEqual(layout.windowSize, { width: 280, height: 440 });
  assert.deepEqual(layout.petOffset, { x: 120, y: 280 });
  assert.deepEqual(layout.menuOffset, { x: 0, y: 0 });
  assert.deepEqual(
    {
      x: layout.windowPosition.x + layout.petOffset.x,
      y: layout.windowPosition.y + layout.petOffset.y,
    },
    { x: 640, y: 400 },
  );
});

test("coalesces pending window layouts so the latest state wins", async () => {
  assert.equal(typeof logic.createLatestTaskQueue, "function");
  const applied = [];
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const schedule = logic.createLatestTaskQueue(async (layout) => {
    applied.push(`start:${layout}`);
    if (layout === "pet") await firstBlocked;
    applied.push(`end:${layout}`);
  });

  const first = schedule("pet");
  await Promise.resolve();
  schedule("menu");
  const latest = schedule("keyboard");
  releaseFirst();
  await Promise.all([first, latest]);

  assert.deepEqual(applied, [
    "start:pet",
    "end:pet",
    "start:keyboard",
    "end:keyboard",
  ]);
});

test("refreshes monitor bounds before clamping a released drag", () => {
  const source = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");
  const releaseStart = source.indexOf('window.addEventListener("mouseup"');
  const releaseEnd = source.indexOf("// ---------- context menu", releaseStart);
  const releasePath = source.slice(releaseStart, releaseEnd);
  const refreshIndex = releasePath.indexOf("await refreshMonitorBounds()");
  const clampIndex = releasePath.indexOf("clampPetPosition(");

  assert.ok(refreshIndex >= 0, "drag release must await monitor refresh");
  assert.ok(clampIndex > refreshIndex, "drag release must clamp after monitor refresh");
});

test("returns the configured pomodoro pose unchanged", () => {
  assert.equal(pomodoroResumePose("sit"), "sit");
  assert.equal(pomodoroResumePose("idle"), "idle");
});

test("restores the configured pomodoro pose after a drag", () => {
  const source = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");
  const releaseStart = source.indexOf('window.addEventListener("mouseup"');
  const releaseEnd = source.indexOf("// ---------- context menu", releaseStart);
  const releasePath = source.slice(releaseStart, releaseEnd);

  assert.match(releasePath, /pomodoroResumePose\(pomoConfig\.pose\)/);
  assert.doesNotMatch(releasePath, /lockedState\s*=\s*"lying"/);
  assert.doesNotMatch(releasePath, /enter\("lying"\)/);
});

test("switches listener mode and prevents local/global double counting", () => {
  let state = createKeyboardState();
  state = applyKeyboardStatus(state, {
    status: "fallback",
    reason: "permission-required",
  });
  state = recordKeyboardEvent(state, { source: "local", code: "KeyA", at: 1000 });
  assert.equal(state.total, 1);

  state = applyKeyboardStatus(state, { status: "active", reason: null });
  state = recordKeyboardEvent(state, { source: "local", code: "KeyA", at: 1100 });
  state = recordKeyboardEvent(state, { source: "global", code: "KeyB", at: 1200 });

  assert.equal(state.mode, "global");
  assert.equal(state.total, 2);
  assert.deepEqual(state.keyCounts, { KeyA: 1, KeyB: 1 });
});

test("resets a work interval but preserves statistics across suspend and resume", () => {
  let state = createKeyboardState();
  state = recordKeyboardEvent(state, { source: "local", code: "KeyA", at: 1000 });
  state = setKeyboardSuspended(state, true);
  state = recordKeyboardEvent(state, { source: "local", code: "KeyB", at: 1100 });
  assert.equal(state.total, 1);

  state = setKeyboardSuspended(state, false);
  state = recordKeyboardEvent(state, { source: "local", code: "KeyB", at: 1200 });
  assert.equal(state.total, 2);

  state = resetKeyboardState(state);
  assert.equal(state.total, 0);
  assert.deepEqual(state.keyCounts, {});
  assert.equal(state.mode, "local-fallback");
});

test("counts key presses from the rolling previous minute", () => {
  assert.equal(
    countRecentKeyPresses([39_999, 40_000, 40_001, 99_999], 100_000),
    2,
  );
  assert.equal(countRecentKeyPresses([], 100_000), 0);
});

test("shows a keys-per-minute rate that refreshes while visible", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const keyboard = readFileSync(
    new URL("../src/keyboard.js", import.meta.url),
    "utf8",
  );

  assert.match(html, /id="kbKpm">0 键\/分</);
  assert.doesNotMatch(html, /WPM/);
  assert.match(keyboard, /setInterval\(renderStatistics, 1000\)/);
});

test("uses macOS input monitoring permission for global key capture", () => {
  const keyboardFrontend = readFileSync(
    new URL("../src/keyboard.js", import.meta.url),
    "utf8",
  );
  const keyboardNative = readFileSync(
    new URL("../src-tauri/src/keyboard.rs", import.meta.url),
    "utf8",
  );

  assert.match(keyboardNative, /CGPreflightListenEventAccess/);
  assert.match(keyboardNative, /CGRequestListenEventAccess/);
  assert.doesNotMatch(keyboardNative, /application_is_trusted_with_prompt/);
  assert.match(
    keyboardFrontend,
    /input-monitoring-required[\s\S]*需要输入监控权限/,
  );
});

test("keeps short pet speech compact and wraps long messages", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const pet = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");
  const bubbleStyles = html.slice(
    html.indexOf("#bubble {"),
    html.indexOf("#bubble::after"),
  );

  assert.match(bubbleStyles, /top:\s*4px/);
  assert.match(bubbleStyles, /width:\s*max-content/);
  assert.match(
    bubbleStyles,
    /max-width:\s*min\(200px,\s*calc\(100vw\s*-\s*16px\)\)/,
  );
  assert.match(bubbleStyles, /white-space:\s*pre-line/);
  assert.match(bubbleStyles, /overflow-wrap:\s*anywhere/);
  assert.match(bubbleStyles, /text-align:\s*center/);
  assert.match(pet, /bubble\.style\.left\s*=.*layout\.petOffset\.x/);
  assert.match(pet, /bubble\.style\.top\s*=.*layout\.petOffset\.y.*petInsets\.top/);
});

test("renders the simulated keyboard as a compact speech bubble", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const keyboard = readFileSync(
    new URL("../src/keyboard.js", import.meta.url),
    "utf8",
  );
  const pet = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");
  const timerStyles = html.slice(
    html.indexOf("#timer"),
    html.indexOf("#ctxMenu"),
  );

  assert.match(
    keyboard,
    /KEYBOARD_PANEL_MIN_SIZE\s*=\s*\{\s*width:\s*260,\s*height:\s*170\s*\}/,
  );
  assert.match(keyboard, /resolvePanelSize/);
  assert.match(keyboard, /scrollWidth/);
  assert.match(keyboard, /panel\.dataset\.placement\s*=\s*rect\.placement/);
  assert.match(keyboard, /--pointer-offset/);
  assert.match(html, /#kbPanel::after/);
  assert.match(html, /#kbPanel\[data-placement="above"\]::after/);
  assert.match(timerStyles, /white-space:\s*nowrap/);
  assert.match(pet, /timerEl\.style\.left\s*=.*layout\.panelOffset\.x/);
  assert.match(pet, /timerEl\.style\.top\s*=.*layout\.panelOffset\.y/);
});

test("allows Windows form controls and keyboard rows to shrink inside panels", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

  assert.match(html, /"Segoe UI"/);
  assert.match(html, /"Microsoft YaHei UI"/);
  assert.match(html, /\.preset-btn[\s\S]*?min-width:\s*0/);
  assert.match(html, /\.actions button[\s\S]*?min-width:\s*0/);
  assert.match(html, /\.kb-row[\s\S]*?min-width:\s*0/);
  assert.match(html, /\.kb-key[\s\S]*?overflow:\s*hidden/);
});
