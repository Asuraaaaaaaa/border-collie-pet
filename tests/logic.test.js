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

test("adapts a social panel without covering the pet on a short display", () => {
  const workArea = { x: 0, y: 0, width: 600, height: 480 };
  const layout = calculateKeyboardLayout({
    petPosition: { x: 200, y: 100 },
    petSize: 320,
    panelSize: { width: 320, height: 420 },
    minimumPanelSize: { width: 260, height: 240 },
    workArea,
  });

  assert.equal(layout.overlay, false);
  assert.equal(layout.placement, "left");
  assert.deepEqual(layout.panelSize, { width: 272, height: 420 });
  assert.deepEqual(layout.petPosition, { x: 280, y: 100 });
  assert.equal(
    layout.windowPosition.x + layout.panelOffset.x + layout.panelSize.width
      <= layout.petPosition.x,
    true,
  );
  assert.equal(
    layout.windowPosition.y + layout.panelOffset.y + layout.panelSize.height
      <= workArea.y + workArea.height,
    true,
  );
});

test("keeps the pet under the pointer when dragging an expanded window", () => {
  assert.equal(typeof logic.windowPositionForPet, "function");
  assert.deepEqual(
    logic.windowPositionForPet({ x: 640, y: 420 }, { x: 60, y: 190 }),
    { x: 580, y: 230 },
  );
  assert.deepEqual(
    logic.windowPositionForPet({ x: 640, y: 420 }),
    { x: 640, y: 420 },
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

test("places a tall context menu beside the pet on a short display", () => {
  const layout = logic.calculateMenuLayout({
    petPosition: { x: 200, y: 100 },
    petSize: 320,
    menuSize: { width: 260, height: 420 },
    minimumMenuSize: { width: 220, height: 180 },
    workArea: { x: 0, y: 0, width: 600, height: 480 },
  });

  assert.equal(layout.placement, "left");
  assert.deepEqual(layout.menuSize, { width: 260, height: 420 });
  assert.deepEqual(layout.petPosition, { x: 268, y: 100 });
  assert.equal(
    layout.windowPosition.x + layout.menuOffset.x + layout.menuSize.width
      <= layout.petPosition.x,
    true,
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

test("creates a trimmed memo with a future due time", () => {
  assert.equal(typeof logic.createMemo, "function");
  assert.deepEqual(
    logic.createMemo({
      id: "memo-1",
      content: "  提交周报  ",
      dueAt: 70_000,
      now: 10_000,
    }),
    {
      id: "memo-1",
      content: "提交周报",
      dueAt: 70_000,
      createdAt: 10_000,
      updatedAt: 10_000,
      completedAt: null,
    },
  );
  assert.throws(
    () => logic.createMemo({ id: "memo-2", content: "   ", dueAt: 70_000, now: 10_000 }),
    /请输入备忘内容/,
  );
  assert.throws(
    () => logic.createMemo({ id: "memo-3", content: "过期", dueAt: 9_999, now: 10_000 }),
    /到期时间需要晚于当前时间/,
  );
  assert.throws(
    () => logic.createMemo({
      id: "memo-4",
      content: "无效日期",
      dueAt: Number.MAX_VALUE,
      now: 10_000,
    }),
    /请选择有效的到期时间/,
  );
});

test("loads only valid persisted memos and tolerates damaged storage", () => {
  assert.equal(typeof logic.parseMemos, "function");
  assert.deepEqual(logic.parseMemos("not-json"), []);
  assert.deepEqual(logic.parseMemos(JSON.stringify([
    {
      id: "valid",
      content: "  取快递 ",
      dueAt: 30_000,
      createdAt: 1_000,
      updatedAt: 2_000,
      completedAt: null,
    },
    { id: "missing-time", content: "无效" },
    {
      id: "invalid-date",
      content: "无法格式化",
      dueAt: Number.MAX_VALUE,
      createdAt: 1_000,
      updatedAt: 1_000,
      completedAt: null,
    },
  ])), [{
    id: "valid",
    content: "取快递",
    dueAt: 30_000,
    createdAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
  }]);
});

test("selects the earliest unfinished memo that is due", () => {
  assert.equal(typeof logic.getNextDueMemo, "function");
  const memos = [
    { id: "later", content: "B", dueAt: 9_000, completedAt: null },
    { id: "done", content: "C", dueAt: 1_000, completedAt: 5_000 },
    { id: "first", content: "A", dueAt: 3_000, completedAt: null },
    { id: "future", content: "D", dueAt: 11_000, completedAt: null },
  ];

  assert.equal(logic.getNextDueMemo(memos, 10_000)?.id, "first");
  assert.equal(logic.getNextDueMemo(memos, 2_000), null);
});

test("completes and snoozes memos without changing unrelated entries", () => {
  assert.equal(typeof logic.completeMemo, "function");
  assert.equal(typeof logic.snoozeMemo, "function");
  const memos = [
    { id: "first", content: "A", dueAt: 3_000, updatedAt: 1_000, completedAt: null },
    { id: "second", content: "B", dueAt: 4_000, updatedAt: 1_000, completedAt: null },
  ];

  const completed = logic.completeMemo(memos, "first", 10_000);
  assert.equal(completed[0].completedAt, 10_000);
  assert.equal(completed[0].updatedAt, 10_000);
  assert.equal(completed[1], memos[1]);

  const snoozed = logic.snoozeMemo(memos, "first", 15, 10_000);
  assert.equal(snoozed[0].dueAt, 910_000);
  assert.equal(snoozed[0].updatedAt, 10_000);
  assert.equal(snoozed[0].completedAt, null);
  assert.equal(snoozed[1], memos[1]);
});

test("sorts unfinished memos by due time", () => {
  assert.equal(typeof logic.getActiveMemos, "function");
  const memos = [
    { id: "later", dueAt: 8_000, completedAt: null },
    { id: "done", dueAt: 1_000, completedAt: 2_000 },
    { id: "first", dueAt: 3_000, completedAt: null },
  ];

  assert.deepEqual(
    logic.getActiveMemos(memos).map((memo) => memo.id),
    ["first", "later"],
  );
});

test("edits and deletes only the selected memo", () => {
  assert.equal(typeof logic.updateMemo, "function");
  assert.equal(typeof logic.deleteMemo, "function");
  const memos = [
    {
      id: "first",
      content: "旧内容",
      dueAt: 30_000,
      createdAt: 1_000,
      updatedAt: 1_000,
      completedAt: null,
    },
    { id: "second", content: "B", dueAt: 40_000, completedAt: null },
  ];

  const updated = logic.updateMemo(
    memos,
    "first",
    { content: "  新内容  ", dueAt: 50_000 },
    10_000,
  );
  assert.deepEqual(updated[0], {
    id: "first",
    content: "新内容",
    dueAt: 50_000,
    createdAt: 1_000,
    updatedAt: 10_000,
    completedAt: null,
  });
  assert.equal(updated[1], memos[1]);
  assert.deepEqual(logic.deleteMemo(updated, "first"), [memos[1]]);
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
  const keyboardStyles = html.slice(
    html.indexOf("#kbPanel {"),
    html.indexOf("#kbPanel::after"),
  );

  assert.match(
    keyboard,
    /KEYBOARD_PANEL_MIN_SIZE\s*=\s*\{\s*width:\s*260,\s*height:\s*170\s*\}/,
  );
  assert.match(keyboard, /resolvePanelSize/);
  assert.match(keyboard, /scrollWidth/);
  assert.match(keyboard, /panel\.dataset\.placement\s*=\s*rect\.placement/);
  assert.match(keyboard, /--pointer-offset/);
  assert.match(keyboardStyles, /display:\s*none/);
  assert.doesNotMatch(html, /<div id="kbPanel"[^>]*style=/);
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

test("keeps context-menu panels inside a stable Windows menu width", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const pet = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");

  assert.match(pet, /const MENU_WIDTH = 260/);
  assert.match(pet, /width:\s*menuWidth,\s*height:\s*bounds\.height/);
  assert.match(
    html,
    /\.pomo-panel,[\s\S]*?#interactPanel\s*\{[\s\S]*?display:\s*none;[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%/,
  );
  assert.doesNotMatch(html, /(?:pomoPanel|memoPanel|interactPanel)" style=/);
});

test("provides a persistent pet pocket with desktop file drop support", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const pet = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");
  const nativeMain = readFileSync(
    new URL("../src-tauri/src/main.rs", import.meta.url),
    "utf8",
  );

  for (const id of [
    "pocketItem",
    "pocketCount",
    "pocketPanel",
    "pocketRetention",
    "pocketList",
    "pocketForm",
    "pocketInput",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(pet, /localStorage\.getItem\(POCKET_STORAGE_KEY\)/);
  assert.match(pet, /localStorage\.getItem\(POCKET_RETENTION_KEY\)/);
  assert.match(pet, /win\.onDragDropEvent/);
  assert.match(pet, /open_pocket_target/);
  assert.match(nativeMain, /pocket::open_pocket_target/);
  assert.match(
    html,
    /\.pomo-panel,[\s\S]*?\.pocket-panel,[\s\S]*?#interactPanel\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%/,
  );
});

test("provides memo management and a persistent due reminder", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const pet = readFileSync(new URL("../src/pet.js", import.meta.url), "utf8");

  for (const id of [
    "memoItem",
    "memoCount",
    "memoPanel",
    "memoList",
    "memoForm",
    "memoContent",
    "memoDueAt",
    "memoAlert",
    "memoAlertContent",
    "memoComplete",
    "memoSnooze",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(pet, /localStorage\.getItem\(MEMO_STORAGE_KEY\)/);
  assert.match(pet, /getNextDueMemo\(memos/);
  assert.match(pet, /setInterval\(checkDueMemos,\s*1000\)/);
  assert.match(pet, /visibilitychange/);
  assert.match(pet, /snoozeMemo\(memos/);
  assert.match(pet, /completeMemo\(memos/);
  assert.match(pet, /closest\("\[data-act\]"\)/);
  assert.match(
    pet,
    /reminderChanged\s*&&\s*memoPanel\.style\.display\s*===\s*"block"/,
  );

  const reminderStart = pet.indexOf("function checkDueMemos()");
  const reminderEnd = pet.indexOf("memoAdd.addEventListener", reminderStart);
  const reminderPath = pet.slice(reminderStart, reminderEnd);
  assert.match(reminderPath, /if \(menuOpen\)[\s\S]*?closeMenu\(\)/);

  const contextMenuStart = pet.indexOf('img.addEventListener("contextmenu"');
  const contextMenuEnd = pet.indexOf('document.addEventListener("click"', contextMenuStart);
  const contextMenuPath = pet.slice(contextMenuStart, contextMenuEnd);
  assert.match(contextMenuPath, /if \(activeMemo\) return/);

  assert.match(pet, /function resumeKeyboardIfAllowed\(\)/);
  assert.match(pet, /function showKeyboardForPomodoro\(/);
  assert.match(pet, /windowPositionForPet\(pos, dragWindowOffset\)/);
  assert.match(pet, /const persistedMemos = getActiveMemos\(nextMemos\)/);
});

test("aligns the memo label with status menu items", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(
    html,
    /class="item uncheck" data-act="memo" id="memoItem"/,
  );
  const memoItemStyles = html.slice(
    html.indexOf("#memoItem {"),
    html.indexOf("#memoCount {"),
  );
  assert.match(memoItemStyles, /display:\s*grid/);
  assert.match(
    memoItemStyles,
    /grid-template-columns:\s*max-content minmax\(0,\s*1fr\) auto/,
  );
});

test("keeps checked and unchecked menu labels at the same position", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const markerStyles = html.slice(
    html.indexOf("#ctxMenu .check::before"),
    html.indexOf("#ctxMenu .has-sub::after"),
  );
  assert.match(
    markerStyles,
    /#ctxMenu \.check::before,\s*#ctxMenu \.uncheck::before\s*\{/,
  );
  assert.match(markerStyles, /display:\s*inline-block/);
  assert.match(markerStyles, /width:\s*1em/);
  assert.match(markerStyles, /margin-right:\s*4px/);
});
