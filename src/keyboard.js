import {
  KEYBOARD_LAYOUT,
  applyKeyboardStatus,
  createKeyboardState,
  recordKeyboardEvent,
  resetKeyboardState,
  setKeyboardSuspended,
} from "./logic.js";

export const KEYBOARD_PANEL_SIZE = { width: 340, height: 220 };

const panel = document.getElementById("kbPanel");
const board = document.getElementById("kbBoard");
const count = document.getElementById("kbCount");
const wpm = document.getElementById("kbWpm");
const topKeys = document.getElementById("kbTop5");
const status = document.getElementById("kbStatus");
const retry = document.getElementById("kbRetry");
const keyElements = new Map();

let keyboardState = createKeyboardState();
let requestedVisible = false;
let layoutHandler = () => {};
let listenersReadyPromise = null;
let listenerStartPromise = null;

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
    recentTimes: keyboardState.recentTimes.filter((time) => now - time < 5000),
  };
  count.textContent = `${keyboardState.total} 键`;
  wpm.textContent = `${Math.round(keyboardState.recentTimes.length * 12 / 5)} WPM`;

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
    bar.style.width = `${Math.round(keyCount / maximum * 40)}px`;
    item.appendChild(bar);
    topKeys.appendChild(item);
  }
}

function renderStatus() {
  if (keyboardState.mode === "global") {
    status.textContent = "全局监听";
    retry.hidden = true;
    return;
  }

  status.textContent = keyboardState.reason === "permission-required"
    ? "窗口监听 · 需要辅助功能权限"
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

export function setKeyboardPanelRect(rect) {
  panel.style.left = `${rect.x}px`;
  panel.style.top = `${rect.y}px`;
  panel.style.width = `${rect.width}px`;
  panel.style.height = `${rect.height}px`;
}

export function showKeyboard({ reset = true } = {}) {
  requestedVisible = true;
  keyboardState = setKeyboardSuspended(keyboardState, false);
  if (reset) keyboardState = resetKeyboardState(keyboardState);
  panel.style.display = "block";
  renderStatistics();
  renderStatus();
  layoutHandler(true, KEYBOARD_PANEL_SIZE);
  void startKeyboardListener();
}

export function hideKeyboard() {
  requestedVisible = false;
  panel.style.display = "none";
  layoutHandler(false, KEYBOARD_PANEL_SIZE);
}

export function suspendKeyboard() {
  if (!requestedVisible) return;
  keyboardState = setKeyboardSuspended(keyboardState, true);
  panel.style.display = "none";
  layoutHandler(false, KEYBOARD_PANEL_SIZE);
}

export function resumeKeyboard() {
  if (!requestedVisible) return;
  keyboardState = setKeyboardSuspended(keyboardState, false);
  panel.style.display = "block";
  renderStatistics();
  renderStatus();
  layoutHandler(true, KEYBOARD_PANEL_SIZE);
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
