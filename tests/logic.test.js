import assert from "node:assert/strict";
import test from "node:test";

import {
  KEYBOARD_LAYOUT,
  applyKeyboardStatus,
  calculateKeyboardLayout,
  clampPetPosition,
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

test("places the keyboard on the right when it fits", () => {
  const layout = calculateKeyboardLayout({
    petPosition: { x: 100, y: 500 },
    petSize: 160,
    panelSize: { width: 340, height: 220 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  });

  assert.deepEqual(layout.windowPosition, { x: 100, y: 440 });
  assert.deepEqual(layout.windowSize, { width: 500, height: 220 });
  assert.deepEqual(layout.petOffset, { x: 0, y: 60 });
  assert.deepEqual(layout.panelOffset, { x: 160, y: 0 });
  assert.equal(layout.overlay, false);
});

test("places the keyboard on the left near the right edge", () => {
  const petPosition = { x: 1200, y: 500 };
  const layout = calculateKeyboardLayout({
    petPosition,
    petSize: 160,
    panelSize: { width: 340, height: 220 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  });

  assert.deepEqual(layout.windowPosition, { x: 860, y: 440 });
  assert.deepEqual(layout.petOffset, { x: 340, y: 60 });
  assert.deepEqual(layout.panelOffset, { x: 0, y: 0 });
  assert.deepEqual(
    {
      x: layout.windowPosition.x + layout.petOffset.x,
      y: layout.windowPosition.y + layout.petOffset.y,
    },
    petPosition,
  );
});

test("returns the configured pomodoro pose unchanged", () => {
  assert.equal(pomodoroResumePose("sit"), "sit");
  assert.equal(pomodoroResumePose("idle"), "idle");
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
