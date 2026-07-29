function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

export const KEYBOARD_LAYOUT = [
  [
    ["Esc", "Escape"], ["F1", "F1"], ["F2", "F2"], ["F3", "F3"],
    ["F4", "F4"], ["F5", "F5"], ["F6", "F6"], ["F7", "F7"],
    ["F8", "F8"], ["F9", "F9"], ["F10", "F10"], ["F11", "F11"],
    ["F12", "F12"],
  ],
  [
    ["`", "Backquote"], ["1", "Digit1"], ["2", "Digit2"],
    ["3", "Digit3"], ["4", "Digit4"], ["5", "Digit5"],
    ["6", "Digit6"], ["7", "Digit7"], ["8", "Digit8"],
    ["9", "Digit9"], ["0", "Digit0"], ["-", "Minus"],
    ["=", "Equal"], ["Bksp", "Backspace", "wide-2"],
  ],
  [
    ["Tab", "Tab", "wide-2"], ["Q", "KeyQ"], ["W", "KeyW"],
    ["E", "KeyE"], ["R", "KeyR"], ["T", "KeyT"], ["Y", "KeyY"],
    ["U", "KeyU"], ["I", "KeyI"], ["O", "KeyO"], ["P", "KeyP"],
    ["[", "BracketLeft"], ["]", "BracketRight"],
    ["\\", "Backslash", "wide-2"],
  ],
  [
    ["Caps", "CapsLock", "wide-2"], ["A", "KeyA"], ["S", "KeyS"],
    ["D", "KeyD"], ["F", "KeyF"], ["G", "KeyG"], ["H", "KeyH"],
    ["J", "KeyJ"], ["K", "KeyK"], ["L", "KeyL"],
    [";", "Semicolon"], ["'", "Quote"], ["Enter", "Enter", "wide-3"],
  ],
  [
    ["Shift", "ShiftLeft", "wide-3"], ["Z", "KeyZ"], ["X", "KeyX"],
    ["C", "KeyC"], ["V", "KeyV"], ["B", "KeyB"], ["N", "KeyN"],
    ["M", "KeyM"], [",", "Comma"], [".", "Period"], ["/", "Slash"],
    ["Shift", "ShiftRight", "wide-3"],
  ],
  [
    ["Ctrl", "ControlLeft"], ["Alt", "AltLeft"],
    ["Space", "Space", "wide-6"], ["Alt", "AltRight"],
    ["Ctrl", "ControlRight"],
  ],
];

export function monitorWorkAreaToLogical(monitor) {
  const scaleFactor = monitor.scaleFactor || 1;
  return {
    x: monitor.workArea.position.x / scaleFactor,
    y: monitor.workArea.position.y / scaleFactor,
    width: monitor.workArea.size.width / scaleFactor,
    height: monitor.workArea.size.height / scaleFactor,
  };
}

export function clampPetPosition(position, petSize, workArea) {
  return {
    x: clamp(position.x, workArea.x, workArea.x + workArea.width - petSize),
    y: clamp(position.y, workArea.y, workArea.y + workArea.height - petSize),
  };
}

export function defaultPetPosition(workArea, petSize, margins = {}) {
  const right = margins.right ?? 120;
  const bottom = margins.bottom ?? 90;
  return clampPetPosition(
    {
      x: workArea.x + workArea.width - petSize - right,
      y: workArea.y + workArea.height - petSize - bottom,
    },
    petSize,
    workArea,
  );
}

export function calculateKeyboardLayout({
  petPosition,
  petSize,
  petInsets = {},
  panelSize,
  workArea,
  gap = 8,
}) {
  const leftEdge = workArea.x;
  const rightEdge = workArea.x + workArea.width;
  const topEdge = workArea.y;
  const bottomEdge = workArea.y + workArea.height;
  const visiblePet = {
    left: petPosition.x + (petInsets.left ?? 0),
    right: petPosition.x + petSize - (petInsets.right ?? 0),
    top: petPosition.y + (petInsets.top ?? 0),
    bottom: petPosition.y + petSize - (petInsets.bottom ?? 0),
  };
  const visiblePetCenter = {
    x: (visiblePet.left + visiblePet.right) / 2,
    y: (visiblePet.top + visiblePet.bottom) / 2,
  };
  const spaces = {
    above: visiblePet.top - topEdge,
    below: bottomEdge - visiblePet.bottom,
    right: rightEdge - visiblePet.right,
    left: visiblePet.left - leftEdge,
  };
  const requiredSpace = {
    above: panelSize.height + gap,
    below: panelSize.height + gap,
    right: panelSize.width + gap,
    left: panelSize.width + gap,
  };
  const placementOrder = ["above", "below", "right", "left"];
  let placement = placementOrder.find(
    (candidate) => spaces[candidate] >= requiredSpace[candidate],
  );
  if (!placement) {
    placement = placementOrder.reduce(
      (best, candidate) => spaces[candidate] > spaces[best] ? candidate : best,
      placementOrder[0],
    );
  }

  const centeredPanelX = visiblePetCenter.x - panelSize.width / 2;
  const centeredPanelY = visiblePetCenter.y - panelSize.height / 2;
  const panelPosition = {
    x: placement === "right"
      ? visiblePet.right + gap
      : placement === "left"
        ? visiblePet.left - panelSize.width - gap
        : centeredPanelX,
    y: placement === "below"
      ? visiblePet.bottom + gap
      : placement === "above"
        ? visiblePet.top - panelSize.height - gap
        : centeredPanelY,
  };
  panelPosition.x = clamp(
    panelPosition.x,
    leftEdge,
    rightEdge - panelSize.width,
  );
  panelPosition.y = clamp(
    panelPosition.y,
    topEdge,
    bottomEdge - panelSize.height,
  );

  const windowPosition = {
    x: Math.min(petPosition.x, panelPosition.x),
    y: Math.min(petPosition.y, panelPosition.y),
  };
  const windowSize = {
    width: Math.max(
      petPosition.x + petSize,
      panelPosition.x + panelSize.width,
    ) - windowPosition.x,
    height: Math.max(
      petPosition.y + petSize,
      panelPosition.y + panelSize.height,
    ) - windowPosition.y,
  };
  const petOffset = {
    x: petPosition.x - windowPosition.x,
    y: petPosition.y - windowPosition.y,
  };
  const panelOffset = {
    x: panelPosition.x - windowPosition.x,
    y: panelPosition.y - windowPosition.y,
  };
  const pointerOffset = placement === "above" || placement === "below"
    ? clamp(
        visiblePetCenter.x - panelPosition.x,
        18,
        panelSize.width - 18,
      )
    : clamp(
        visiblePetCenter.y - panelPosition.y,
        18,
        panelSize.height - 18,
      );

  return {
    windowPosition,
    windowSize,
    petOffset,
    panelOffset,
    placement,
    pointerOffset,
    overlay: spaces[placement] < requiredSpace[placement],
  };
}

export function pomodoroResumePose(configuredPose) {
  return configuredPose;
}

export function countRecentKeyPresses(recentTimes, now = Date.now()) {
  return recentTimes.filter((time) => now - time < 60_000).length;
}

export function createKeyboardState() {
  return {
    mode: "local-fallback",
    reason: null,
    total: 0,
    keyCounts: {},
    recentTimes: [],
    suspended: false,
  };
}

export function applyKeyboardStatus(state, status) {
  if (status.status === "active") {
    return { ...state, mode: "global", reason: null };
  }
  return {
    ...state,
    mode: "local-fallback",
    reason: status.reason ?? "listener-error",
  };
}

export function recordKeyboardEvent(state, { source, code, at = Date.now() }) {
  if (
    state.suspended
    || !code
    || (source === "local" && state.mode === "global")
    || (source === "global" && state.mode !== "global")
  ) {
    return state;
  }

  return {
    ...state,
    total: state.total + 1,
    keyCounts: {
      ...state.keyCounts,
      [code]: (state.keyCounts[code] || 0) + 1,
    },
    recentTimes: [...state.recentTimes, at],
  };
}

export function resetKeyboardState(state) {
  return {
    ...state,
    total: 0,
    keyCounts: {},
    recentTimes: [],
  };
}

export function setKeyboardSuspended(state, suspended) {
  return { ...state, suspended };
}
