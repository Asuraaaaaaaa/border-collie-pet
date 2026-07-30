function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

export function resolvePanelSize(measurements, minimum, maximum) {
  const borderWidth = Math.max(
    0,
    (measurements.offsetWidth ?? measurements.clientWidth)
      - measurements.clientWidth,
  );
  const borderHeight = Math.max(
    0,
    (measurements.offsetHeight ?? measurements.clientHeight)
      - measurements.clientHeight,
  );
  return {
    width: clamp(
      Math.ceil(Math.max(
        minimum.width,
        measurements.scrollWidth + borderWidth,
      )),
      minimum.width,
      maximum.width,
    ),
    height: clamp(
      Math.ceil(Math.max(
        minimum.height,
        measurements.scrollHeight + borderHeight,
      )),
      minimum.height,
      maximum.height,
    ),
  };
}

export function createLatestTaskQueue(runTask) {
  let pendingTask;
  let hasPendingTask = false;
  let drainPromise = null;

  async function drain() {
    while (hasPendingTask) {
      const task = pendingTask;
      pendingTask = undefined;
      hasPendingTask = false;
      await runTask(task);
    }
  }

  return function schedule(task) {
    pendingTask = task;
    hasPendingTask = true;
    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = null;
      });
    }
    return drainPromise;
  };
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

export function windowPositionForPet(petPosition, petOffset = {}) {
  return {
    x: petPosition.x - (petOffset.x ?? 0),
    y: petPosition.y - (petOffset.y ?? 0),
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

export function calculateMenuLayout({
  petPosition,
  petSize,
  petInsets = {},
  menuSize,
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
  const visiblePetCenterX = (visiblePet.left + visiblePet.right) / 2;
  const availableAbove = Math.max(0, visiblePet.top - topEdge - gap);
  const availableBelow = Math.max(0, bottomEdge - visiblePet.bottom - gap);
  const placement = availableAbove >= menuSize.height
    || (availableBelow < menuSize.height && availableAbove >= availableBelow)
    ? "above"
    : "below";
  const availableHeight = placement === "above"
    ? availableAbove
    : availableBelow;
  const renderedMenuSize = {
    width: Math.min(menuSize.width, workArea.width),
    height: Math.min(menuSize.height, availableHeight),
  };
  const menuPosition = {
    x: Math.round(clamp(
      visiblePetCenterX - renderedMenuSize.width / 2,
      leftEdge,
      rightEdge - renderedMenuSize.width,
    )),
    y: placement === "above"
      ? visiblePet.top - gap - renderedMenuSize.height
      : visiblePet.bottom + gap,
  };
  const windowPosition = {
    x: Math.min(petPosition.x, menuPosition.x),
    y: Math.min(petPosition.y, menuPosition.y),
  };
  const windowSize = {
    width: Math.max(
      petPosition.x + petSize,
      menuPosition.x + renderedMenuSize.width,
    ) - windowPosition.x,
    height: Math.max(
      petPosition.y + petSize,
      menuPosition.y + renderedMenuSize.height,
    ) - windowPosition.y,
  };

  return {
    placement,
    windowPosition,
    windowSize,
    petOffset: {
      x: petPosition.x - windowPosition.x,
      y: petPosition.y - windowPosition.y,
    },
    menuOffset: {
      x: menuPosition.x - windowPosition.x,
      y: menuPosition.y - windowPosition.y,
    },
    menuSize: renderedMenuSize,
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

function isValidTimestamp(value) {
  return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
}

function normalizeMemo(record) {
  if (
    !record
    || typeof record.id !== "string"
    || !record.id
    || typeof record.content !== "string"
    || !record.content.trim()
    || !isValidTimestamp(record.dueAt)
  ) {
    return null;
  }
  return {
    id: record.id,
    content: record.content.trim(),
    dueAt: record.dueAt,
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : record.dueAt,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : record.dueAt,
    completedAt: Number.isFinite(record.completedAt) ? record.completedAt : null,
  };
}

export function createMemo({ id, content, dueAt, now = Date.now() }) {
  const normalizedContent = typeof content === "string" ? content.trim() : "";
  if (!normalizedContent) throw new Error("请输入备忘内容");
  if (!isValidTimestamp(dueAt)) throw new Error("请选择有效的到期时间");
  if (dueAt <= now) {
    throw new Error("到期时间需要晚于当前时间");
  }
  return {
    id,
    content: normalizedContent,
    dueAt,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function parseMemos(serialized) {
  try {
    const records = JSON.parse(serialized ?? "[]");
    if (!Array.isArray(records)) return [];
    return records.map(normalizeMemo).filter(Boolean);
  } catch {
    return [];
  }
}

export function getNextDueMemo(memos, now = Date.now()) {
  return memos
    .filter((memo) => memo.completedAt === null && memo.dueAt <= now)
    .sort((left, right) => left.dueAt - right.dueAt)[0] ?? null;
}

export function getActiveMemos(memos) {
  return memos
    .filter((memo) => memo.completedAt === null)
    .sort((left, right) => left.dueAt - right.dueAt);
}

export function updateMemo(memos, id, { content, dueAt }, now = Date.now()) {
  const updated = createMemo({ id, content, dueAt, now });
  return memos.map((memo) => memo.id === id
    ? {
        ...memo,
        content: updated.content,
        dueAt: updated.dueAt,
        updatedAt: now,
      }
    : memo);
}

export function deleteMemo(memos, id) {
  return memos.filter((memo) => memo.id !== id);
}

export function completeMemo(memos, id, now = Date.now()) {
  return memos.map((memo) => memo.id === id
    ? { ...memo, completedAt: now, updatedAt: now }
    : memo);
}

export function snoozeMemo(memos, id, minutes, now = Date.now()) {
  const dueAt = now + minutes * 60_000;
  return memos.map((memo) => memo.id === id
    ? { ...memo, dueAt, completedAt: null, updatedAt: now }
    : memo);
}
