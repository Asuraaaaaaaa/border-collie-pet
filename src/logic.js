function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

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
  panelSize,
  workArea,
}) {
  const windowSize = {
    width: petSize + panelSize.width,
    height: Math.max(petSize, panelSize.height),
  };
  const rightEdge = workArea.x + workArea.width;
  const bottomEdge = workArea.y + workArea.height;
  const fitsRight = petPosition.x + windowSize.width <= rightEdge;
  const fitsLeft = petPosition.x - panelSize.width >= workArea.x;
  const panelOnRight = fitsRight || !fitsLeft;
  const desiredX = panelOnRight
    ? petPosition.x
    : petPosition.x - panelSize.width;
  const desiredY = petPosition.y + petSize - windowSize.height;
  const windowPosition = {
    x: clamp(desiredX, workArea.x, rightEdge - windowSize.width),
    y: clamp(desiredY, workArea.y, bottomEdge - windowSize.height),
  };
  const petOffset = {
    x: petPosition.x - windowPosition.x,
    y: petPosition.y - windowPosition.y,
  };
  const panelOffset = {
    x: panelOnRight ? petOffset.x + petSize : 0,
    y: windowSize.height - panelSize.height,
  };

  return {
    windowPosition,
    windowSize,
    petOffset,
    panelOffset,
    overlay: false,
  };
}

export function pomodoroResumePose(configuredPose) {
  return configuredPose;
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
