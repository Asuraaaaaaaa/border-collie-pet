import {
  KEYBOARD_LAYOUT,
  applyKeyboardStatus,
  countRecentKeyPresses,
  createKeyboardState,
  recordKeyboardEvent,
  resolvePanelSize,
  resetKeyboardState,
  setKeyboardSuspended,
} from "./logic.js";

export const KEYBOARD_PANEL_MIN_SIZE = { width: 260, height: 170 };
const KEYBOARD_PANEL_MAX_SIZE = { width: 380, height: 240 };

const panel = document.getElementById("kbPanel");
const board = document.getElementById("kbBoard");
const count = document.getElementById("kbCount");
const kpm = document.getElementById("kbKpm");
const topKeys = document.getElementById("kbTop5");
const status = document.getElementById("kbStatus");
const retry = document.getElementById("kbRetry");
const keyElements = new Map();

let keyboardState = createKeyboardState();
let requestedVisible = false;
let layoutHandler = () => {};
let listenersReadyPromise = null;
let listenerStartPromise = null;
let statisticsTimer = null;
let panelSize = { ...KEYBOARD_PANEL_MIN_SIZE };

function getTauri() {
  return window.__TAURI__;
}

function buildKeyboard() {
  for (const row of KEYBOARD_LAYOUT) {
    const rowElement = document.createElement("div");
    rowElement.className = "kb-row";
    for (const [label, code, widthClass] of row) {
      const keyElement = document.createElement("div");
      keyElement.className = `kb-key${widthClass ? ` ${widthClass}` : ""}`;
      keyElement.textContent = label;
      keyElement.dataset.code = code;
      keyElements.set(code, keyElement);
      rowElement.appendChild(keyElement);
    }
    board.appendChild(rowElement);
  }
}

function displayCode(code) {
  return code.replace(/^Key|^Digit/, "").replace(/^Numpad/, "N");
}

function renderStatistics() {
  const now = Date.now();
  keyboardState = {
    ...keyboardState,
    recentTimes: keyboardState.recentTimes.filter((time) => now - time < 60_000),
  };
  count.textContent = `${keyboardState.total} 键`;
  kpm.textContent = `${countRecentKeyPresses(keyboardState.recentTimes, now)} 键/分`;

  const entries = Object.entries(keyboardState.keyCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const maximum = entries[0]?.[1] || 1;
  topKeys.replaceChildren();
  for (const [code, keyCount] of entries) {
    const item = document.createElement("span");
    item.className = "hot-key";
    item.append(displayCode(code));
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.width = `${Math.round(keyCount / maximum * 24)}px`;
    item.appendChild(bar);
    topKeys.appendChild(item);
  }
}

function startStatisticsRefresh() {
  clearInterval(statisticsTimer);
  statisticsTimer = setInterval(renderStatistics, 1000);
}

function stopStatisticsRefresh() {
  clearInterval(statisticsTimer);
  statisticsTimer = null;
}

function renderStatus() {
  if (keyboardState.mode === "global") {
    status.textContent = "全局监听";
    retry.hidden = true;
    return;
  }

  status.textContent = keyboardState.reason === "input-monitoring-required"
    ? "窗口监听 · 需要输入监控权限"
    : keyboardState.reason === "permission-required"
      ? "窗口监听 · 需要系统权限"
      : keyboardState.reason === "listener-error"
        ? "窗口监听 · 全局监听已停止"
        : "窗口监听";
  retry.hidden = !keyboardState.reason;
}

function updateStatus(payload) {
  keyboardState = applyKeyboardStatus(keyboardState, payload);
  renderStatus();
  if (payload.status === "fallback" && payload.reason === "listener-error") {
    listenerStartPromise = null;
  }
}

function recordKey(source, code) {
  const nextState = recordKeyboardEvent(keyboardState, { source, code });
  if (nextState === keyboardState) return;
  keyboardState = nextState;

  const keyElement = keyElements.get(code);
  if (keyElement) {
    keyElement.classList.add("active");
    setTimeout(() => keyElement.classList.remove("active"), 180);
  }
  renderStatistics();
}

function ensureEventListeners() {
  if (!listenersReadyPromise) {
    const tauri = getTauri();
    listenersReadyPromise = Promise.all([
      tauri.event.listen("global-keydown", ({ payload }) => {
        if (requestedVisible && !keyboardState.suspended) {
          recordKey("global", payload);
        }
      }),
      tauri.event.listen("keyboard-listener-status", ({ payload }) => {
        updateStatus(payload);
      }),
    ]).catch((error) => {
      listenersReadyPromise = null;
      throw error;
    });
  }
  return listenersReadyPromise;
}

function startKeyboardListener(force = false) {
  if (force) listenerStartPromise = null;
  if (!listenerStartPromise) {
    listenerStartPromise = (async () => {
      try {
        await ensureEventListeners();
        const payload = await getTauri().core.invoke("start_keyboard_listener");
        updateStatus(payload);
        return payload;
      } catch (error) {
        console.error("[keyboard] global listener startup failed:", error);
        const payload = { status: "fallback", reason: "listener-error" };
        updateStatus(payload);
        return payload;
      }
    })();
  }
  return listenerStartPromise;
}

export function configureKeyboardLayout(handler) {
  layoutHandler = handler;
}

function measureKeyboardPanel() {
  panel.style.width = `${KEYBOARD_PANEL_MIN_SIZE.width}px`;
  panel.style.height = `${KEYBOARD_PANEL_MIN_SIZE.height}px`;
  panelSize = resolvePanelSize(
    {
      clientWidth: panel.clientWidth,
      clientHeight: panel.clientHeight,
      offsetWidth: panel.offsetWidth,
      offsetHeight: panel.offsetHeight,
      scrollWidth: panel.scrollWidth,
      scrollHeight: panel.scrollHeight,
    },
    KEYBOARD_PANEL_MIN_SIZE,
    KEYBOARD_PANEL_MAX_SIZE,
  );
  panel.style.width = `${panelSize.width}px`;
  panel.style.height = `${panelSize.height}px`;
  return panelSize;
}

export function setKeyboardPanelRect(rect) {
  panel.style.left = `${rect.x}px`;
  panel.style.top = `${rect.y}px`;
  panel.style.width = `${rect.width}px`;
  panel.style.height = `${rect.height}px`;
  panel.dataset.placement = rect.placement;
  panel.style.setProperty("--pointer-offset", `${rect.pointerOffset}px`);
}

export function showKeyboard({ reset = true } = {}) {
  requestedVisible = true;
  keyboardState = setKeyboardSuspended(keyboardState, false);
  if (reset) keyboardState = resetKeyboardState(keyboardState);
  panel.style.display = "block";
  renderStatistics();
  startStatisticsRefresh();
  renderStatus();
  layoutHandler(true, measureKeyboardPanel());
  void startKeyboardListener();
}

export function hideKeyboard() {
  requestedVisible = false;
  stopStatisticsRefresh();
  panel.style.display = "none";
  layoutHandler(false, panelSize);
}

export function suspendKeyboard() {
  if (!requestedVisible) return;
  keyboardState = setKeyboardSuspended(keyboardState, true);
  stopStatisticsRefresh();
  panel.style.display = "none";
  layoutHandler(false, panelSize);
}

export function resumeKeyboard() {
  if (!requestedVisible) return;
  keyboardState = setKeyboardSuspended(keyboardState, false);
  panel.style.display = "block";
  renderStatistics();
  startStatisticsRefresh();
  renderStatus();
  layoutHandler(true, measureKeyboardPanel());
  void startKeyboardListener();
}

export function getKeyboardSummary() {
  const top = Object.entries(keyboardState.keyCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([code]) => displayCode(code));
  return {
    total: keyboardState.total,
    keyCounts: { ...keyboardState.keyCounts },
    top,
  };
}

window.addEventListener("keydown", (event) => {
  if (!requestedVisible || keyboardState.suspended || !event.code) return;
  recordKey("local", event.code);
});

retry.addEventListener("click", () => {
  void startKeyboardListener(true);
});

buildKeyboard();
renderStatistics();
renderStatus();
