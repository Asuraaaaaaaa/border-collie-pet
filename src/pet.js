// Border collie desktop pet — frame animation + behavior state machine
// Features: pomodoro timer, water reminder, time awareness, battery guard
import {
  KEYBOARD_PANEL_MIN_SIZE,
  configureKeyboardLayout,
  getKeyboardSummary,
  hideKeyboard,
  resumeKeyboard,
  setKeyboardPanelRect,
  showKeyboard,
  suspendKeyboard,
} from "./keyboard.js";
import {
  calculateMenuLayout,
  calculateKeyboardLayout,
  clampPetPosition,
  completeMemo,
  createMemo,
  createLatestTaskQueue,
  defaultPetPosition,
  deleteMemo,
  getActiveMemos,
  getNextDueMemo,
  monitorWorkAreaToLogical,
  parseMemos,
  pomodoroResumePose,
  resolvePanelSize,
  snoozeMemo,
  updateMemo,
  windowPositionForPet,
} from "./logic.js";
import {
  SOCIAL_PANEL_SIZE,
  configureSocialLayout,
  configureSocialNotifications,
  flushSocialNotifications,
  hideSocial,
  initializeSocial,
  setSocialPanelRect,
  showSocial,
} from "./social-ui.js";

const T = window.__TAURI__;
const win = T.window.getCurrentWindow();
const LogicalPosition = T.window.LogicalPosition;

const MIN_SIZE = 100;
const MAX_SIZE = 320;
const DEFAULT_SIZE = 160;
const FOCUS_POSE_VISUAL_INSETS = {
  lying: { top: 60, right: 8, bottom: 20, left: 8 },
  sit: { top: 22, right: 13, bottom: 9, left: 34 },
  idle: { top: 28, right: 12, bottom: 10, left: 25 },
};
const MENU_MIN_SIZE = { width: 220, height: 0 };
const MENU_MAX_WIDTH = 360;
const MEMO_STORAGE_KEY = "linePuppyMemos";
const MEMO_ALERT_MIN_SIZE = { width: 280, height: 144 };
const MEMO_ALERT_MAX_SIZE = { width: 360, height: 280 };
let size = parseInt(localStorage.getItem("petSize")) || DEFAULT_SIZE;
let keyboardVisible = false;
let keyboardPanelSize = { ...KEYBOARD_PANEL_MIN_SIZE };
let socialVisible = false;
let socialPanelSize = { ...SOCIAL_PANEL_SIZE };
let memoAlertSize = { ...MEMO_ALERT_MIN_SIZE };
const W = () => size;
const TICK_MS = 33;

const PET_ASSETS = import.meta.glob([
  "./assets/idle_*.png",
  "./assets/walk_right_*.png",
  "./assets/run_*.png",
  "./assets/sit_*.png",
  "./assets/lying_*.png",
  "./assets/sleep_*.png",
  "./assets/jump_*.png",
  "./assets/wag_*.png",
  "./assets/tilt_*.png",
  "./assets/sniff_*.png",
  "./assets/scratch_*.png",
], {
  eager: true,
  query: "?url",
  import: "default",
});

function petAsset(name) {
  const url = PET_ASSETS[`./assets/${name}`];
  if (!url) throw new Error(`Missing pet asset: ${name}`);
  return url;
}

const ACTIONS = {
  idle:   { frames: [0, 1, 2, 3].map(i => petAsset(`idle_${i}.png`)), fps: 1.5 },
  walk:   { frames: [0, 1, 2, 3].map(i => petAsset(`walk_right_${i}.png`)), fps: 8 },
  run:    { frames: [0, 1, 2, 3].map(i => petAsset(`run_${i}.png`)), fps: 10 },
  sit:    { frames: [petAsset("sit_0.png"), petAsset("sit_1.png")], fps: 1.5 },
  lying:  { frames: [petAsset("lying_0.png")], fps: 1 },
  sleep:  { frames: [petAsset("sleep_0.png")], fps: 1 },
  jump:   { frames: [0, 1, 2].map(i => petAsset(`jump_${i}.png`)), fps: 6 },
  wag:    { frames: [0, 1, 2, 3].map(i => petAsset(`wag_${i}.png`)), fps: 4 },
  tilt:   { frames: [petAsset("tilt_0.png"), petAsset("tilt_1.png")], fps: 5 },
  sniff:  { frames: [petAsset("sniff_0.png"), petAsset("sniff_1.png")], fps: 2 },
  scratch:{ frames: [petAsset("scratch_0.png"), petAsset("scratch_1.png")], fps: 4 },
  happy:  { frames: [petAsset("tilt_0.png"), petAsset("tilt_1.png")], fps: 5 },
  drag:   { frames: [petAsset("tilt_0.png")], fps: 1 },
};

// Actions that don't move the pet (play a one-shot animation in place)
const INPLACE_ACTIONS = new Set(["sit", "jump", "wag", "tilt", "sniff", "scratch", "happy", "drag", "lying"]);

const SLEEP_AFTER = 2400;
const SPEEDS = { walk: 3, run: 7 };

for (const a of Object.values(ACTIONS)) {
  for (const src of a.frames) { new Image().src = src; }
}

const img = document.getElementById("pet");
const bubble = document.getElementById("bubble");
const timerEl = document.getElementById("timer");
const ctxMenu = document.getElementById("ctxMenu");
const pomodoroItem = document.getElementById("pomodoroItem");
const waterItem = document.getElementById("waterItem");
const pomoPanel = document.getElementById("pomoPanel");
const pomoWorkInput = document.getElementById("pomoWork");
const pomoBreakInput = document.getElementById("pomoBreak");
const pomoRoundsInput = document.getElementById("pomoRounds");
const pomoPoseSelect = document.getElementById("pomoPose");
const workVal = document.getElementById("workVal");
const breakVal = document.getElementById("breakVal");
const roundsVal = document.getElementById("roundsVal");
const memoItem = document.getElementById("memoItem");
const memoCount = document.getElementById("memoCount");
const memoPanel = document.getElementById("memoPanel");
const memoList = document.getElementById("memoList");
const memoAdd = document.getElementById("memoAdd");
const memoForm = document.getElementById("memoForm");
const memoFormTitle = document.getElementById("memoFormTitle");
const memoContent = document.getElementById("memoContent");
const memoDueAt = document.getElementById("memoDueAt");
const memoError = document.getElementById("memoError");
const memoCancel = document.getElementById("memoCancel");
const memoAlert = document.getElementById("memoAlert");
const memoAlertContent = document.getElementById("memoAlertContent");
const memoAlertDue = document.getElementById("memoAlertDue");
const memoAlertQueue = document.getElementById("memoAlertQueue");
const memoCompleteButton = document.getElementById("memoComplete");
const memoSnoozeButton = document.getElementById("memoSnooze");
const memoSnoozeOptions = document.getElementById("memoSnoozeOptions");

let state = "idle";
let frameIdx = 0;
let stateTimer = 0;
let stateDuration = 120;
let idleStreak = 0;
let dir = 1;
let pos = { x: 0, y: 0 };
let bounds = { x: 0, y: 0, width: 1280, height: 800 };
let menuOpen = false;
let memos = parseMemos(localStorage.getItem(MEMO_STORAGE_KEY));
let activeMemo = null;
let activeMemoSignature = "";
let editingMemoId = null;
const reportedWindowErrors = new Set();

function reportWindowErrorOnce(operation, error) {
  if (reportedWindowErrors.has(operation)) return;
  reportedWindowErrors.add(operation);
  console.error(`[window] ${operation} failed; keeping the last valid geometry:`, error);
}

async function refreshMonitorBounds(startup = false) {
  try {
    let monitor = await T.window.currentMonitor();
    if (!monitor && startup) monitor = await T.window.primaryMonitor();
    if (monitor) bounds = monitorWorkAreaToLogical(monitor);
  } catch (error) {
    reportWindowErrorOnce("monitor lookup", error);
  }
  return bounds;
}

async function setWindowSize(width, height) {
  try {
    await win.setSize(new T.window.LogicalSize(width, height));
  } catch (error) {
    reportWindowErrorOnce("window resize", error);
  }
}

async function setWindowPosition(position) {
  try {
    await win.setPosition(new LogicalPosition(
      Math.round(position.x),
      Math.round(position.y),
    ));
  } catch (error) {
    reportWindowErrorOnce("window move", error);
  }
}

const scheduleWindowGeometry = createLatestTaskQueue(async (geometry) => {
  await setWindowSize(geometry.size.width, geometry.size.height);
  await setWindowPosition(geometry.position);
});

function scaledPetInsets(pose) {
  const insetScale = size / DEFAULT_SIZE;
  const baseInsets = FOCUS_POSE_VISUAL_INSETS[pose]
    ?? FOCUS_POSE_VISUAL_INSETS.idle;
  return Object.fromEntries(
    Object.entries(baseInsets).map(([edge, value]) => [
      edge,
      Math.round(value * insetScale),
    ]),
  );
}

function measureMemoAlert() {
  memoAlert.style.width = `${MEMO_ALERT_MIN_SIZE.width}px`;
  memoAlert.style.height = "auto";
  memoAlertSize = resolvePanelSize(
    {
      clientWidth: memoAlert.clientWidth,
      clientHeight: memoAlert.clientHeight,
      offsetWidth: memoAlert.offsetWidth,
      offsetHeight: memoAlert.offsetHeight,
      scrollWidth: memoAlert.scrollWidth,
      scrollHeight: memoAlert.scrollHeight,
    },
    MEMO_ALERT_MIN_SIZE,
    {
      width: Math.min(MEMO_ALERT_MAX_SIZE.width, bounds.width),
      height: Math.min(MEMO_ALERT_MAX_SIZE.height, bounds.height),
    },
  );
  memoAlert.style.width = `${memoAlertSize.width}px`;
  memoAlert.style.height = `${memoAlertSize.height}px`;
  return memoAlertSize;
}

function setMemoAlertRect(rect) {
  memoAlert.style.left = `${rect.x}px`;
  memoAlert.style.top = `${rect.y}px`;
  memoAlert.style.width = `${rect.width}px`;
  memoAlert.style.height = `${rect.height}px`;
  memoAlert.dataset.placement = rect.placement;
  memoAlert.style.setProperty("--pointer-offset", `${rect.pointerOffset}px`);
}

async function applyWindowLayout() {
  if (menuOpen) return;
  pos = clampPetPosition(pos, size, bounds);

  if (activeMemo) {
    memoAlert.style.display = "block";
    const panelSize = measureMemoAlert();
    const petInsets = scaledPetInsets("wag");
    const layout = calculateKeyboardLayout({
      petPosition: pos,
      petSize: size,
      petInsets,
      panelSize,
      workArea: bounds,
    });
    img.style.left = `${layout.petOffset.x}px`;
    img.style.top = `${layout.petOffset.y}px`;
    bubble.style.left = `${layout.petOffset.x + size / 2}px`;
    bubble.style.top = `${layout.petOffset.y + petInsets.top - 4}px`;
    timerEl.style.left = `${layout.petOffset.x + size - 4}px`;
    timerEl.style.top = `${layout.petOffset.y + 4}px`;
    timerEl.style.right = "auto";
    timerEl.style.transform = "translateX(-100%)";
    setMemoAlertRect({
      x: layout.panelOffset.x,
      y: layout.panelOffset.y,
      width: panelSize.width,
      height: panelSize.height,
      placement: layout.placement,
      pointerOffset: layout.pointerOffset,
    });
    await scheduleWindowGeometry({
      size: layout.windowSize,
      position: layout.windowPosition,
    });
    return;
  }

  if (!socialVisible && !keyboardVisible) {
    img.style.left = "0";
    img.style.top = "0";
    bubble.style.left = "50%";
    bubble.style.top = "4px";
    timerEl.style.left = "auto";
    timerEl.style.top = "4px";
    timerEl.style.right = "4px";
    timerEl.style.transform = "none";
    await scheduleWindowGeometry({
      size: { width: size, height: size },
      position: pos,
    });
    return;
  }

  const petInsets = scaledPetInsets(
    pomodoro.active && pomodoro.phase === "work" ? pomoConfig.pose : state,
  );
  const activePanelSize = socialVisible
    ? {
        width: Math.min(socialPanelSize.width, bounds.width),
        height: Math.min(socialPanelSize.height, bounds.height),
      }
    : keyboardPanelSize;
  const layout = calculateKeyboardLayout({
    petPosition: pos,
    petSize: size,
    petInsets,
    panelSize: activePanelSize,
    workArea: bounds,
  });
  img.style.left = `${layout.petOffset.x}px`;
  img.style.top = `${layout.petOffset.y}px`;
  bubble.style.left = `${layout.petOffset.x + size / 2}px`;
  bubble.style.top = `${layout.petOffset.y + petInsets.top - 4}px`;
  timerEl.style.left = `${layout.panelOffset.x + activePanelSize.width / 2}px`;
  timerEl.style.top = `${layout.panelOffset.y + 3}px`;
  timerEl.style.right = "auto";
  timerEl.style.transform = "translateX(-50%)";
  const panelRect = {
    x: layout.panelOffset.x,
    y: layout.panelOffset.y,
    width: activePanelSize.width,
    height: activePanelSize.height,
    placement: layout.placement,
    pointerOffset: layout.pointerOffset,
  };
  if (socialVisible) setSocialPanelRect(panelRect);
  else setKeyboardPanelRect(panelRect);
  await scheduleWindowGeometry({
    size: layout.windowSize,
    position: layout.windowPosition,
  });
}

let bubbleTimer = null;
function showBubble(text, ms = 4000) {
  if (activeMemo) return;
  bubble.textContent = text;
  bubble.style.display = "block";
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.style.display = "none"; }, ms);
}

function resumeKeyboardIfAllowed() {
  if (activeMemo) {
    suspendKeyboard();
    return;
  }
  resumeKeyboard();
}

function showKeyboardForPomodoro(options) {
  showKeyboard(options);
  if (activeMemo) suspendKeyboard();
}

let animTimer = null;
function startAnim() {
  clearInterval(animTimer);
  const a = ACTIONS[state];
  frameIdx = 0;
  img.src = a.frames[0];
  animTimer = setInterval(() => {
    frameIdx = (frameIdx + 1) % a.frames.length;
    img.src = a.frames[frameIdx];
  }, 1000 / a.fps);
}

function rand(min, max) { return Math.floor(Math.random() * (max - min)) + min; }

function getTimePhase() {
  const h = new Date().getHours();
  if (h >= 7 && h < 11)  return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

const PHASE_BEHAVIOR = {
  morning:   { walk: 0.30, run: 0.15, jump: 0.05, sit: 0.05, wag: 0.08, tilt: 0.05, sniff: 0.04, scratch: 0.04, idle: 0.24 },
  midday:    { walk: 0.15, run: 0.04, jump: 0.03, sit: 0.10, wag: 0.05, tilt: 0.04, sniff: 0.05, scratch: 0.05, idle: 0.21, lying: 0.28 },
  afternoon: { walk: 0.25, run: 0.12, jump: 0.05, sit: 0.05, wag: 0.08, tilt: 0.05, sniff: 0.05, scratch: 0.05, idle: 0.30 },
  evening:   { walk: 0.20, run: 0.08, jump: 0.04, sit: 0.08, wag: 0.06, tilt: 0.06, sniff: 0.05, scratch: 0.05, idle: 0.38 },
  night:     { sleep: 1.0 },
};

function pickNextFromPhase() {
  const phase = getTimePhase();
  const weights = PHASE_BEHAVIOR[phase];
  let r = Math.random();
  for (const [act, w] of Object.entries(weights)) {
    if (r < w) return act;
    r -= w;
  }
  return "idle";
}

let lockedState = null;
function enter(s) {
  if (activeMemo && s !== "drag" && s !== "wag") s = "wag";
  else if (lockedState && s !== "drag" && s !== lockedState) s = lockedState;
  state = s;
  stateTimer = 0;
  idleStreak = s === "idle" ? idleStreak : 0;
  if (s === "walk") {
    dir = Math.random() < 0.5 ? -1 : 1;
    img.classList.toggle("flip", dir === -1);
    stateDuration = rand(50, 130);
  } else if (s === "run") {
    dir = Math.random() < 0.5 ? -1 : 1;
    img.classList.toggle("flip", dir === -1);
    stateDuration = rand(40, 90);
  } else if (s === "idle") {
    stateDuration = rand(70, 200);
  } else if (s === "sit") {
    stateDuration = rand(400, 800);
  } else if (s === "jump") {
    stateDuration = 50;   // short one-shot animation
  } else if (s === "wag") {
    stateDuration = rand(80, 160);
  } else if (s === "tilt") {
    stateDuration = rand(50, 90);
  } else if (s === "sniff") {
    stateDuration = rand(80, 150);
  } else if (s === "scratch") {
    stateDuration = rand(60, 120);
  } else if (s === "happy") {
    stateDuration = 32;
  } else if (s === "lying") {
    stateDuration = 90;
  } else {
    stateDuration = Infinity;
  }
  startAnim();
}

// ---------- behavior loop ----------
function tick() {
  stateTimer++;

  if (pomodoro.active) updatePomodoro();

  // Keep the pet anchored while an expanded panel is attached to it.
  if (menuOpen || socialVisible) return;

  if (state === "walk" || state === "run") {
    pos.x += dir * SPEEDS[state];
    if (pos.x <= bounds.x) { pos.x = bounds.x; dir = 1; img.classList.remove("flip"); }
    const rightEdge = bounds.x + bounds.width - W();
    if (pos.x >= rightEdge) { pos.x = rightEdge; dir = -1; img.classList.add("flip"); }
    void setWindowPosition(pos);
    if (stateTimer > stateDuration) enter(pickNextFromPhase());
  } else if (state === "idle") {
    idleStreak++;
    if (!lockedState && getTimePhase() === "night") { enter("sleep"); return; }
    if (idleStreak > SLEEP_AFTER) { enter("lying"); return; }
    if (stateTimer > stateDuration) enter(pickNextFromPhase());
  } else if (INPLACE_ACTIONS.has(state)) {
    if (stateTimer > stateDuration) {
      if (state === "lying") enter("sleep");
      else if (lockedState) enter(lockedState);
      else if (getTimePhase() === "night") enter("sleep");
      else enter("idle");
    }
  } else if (state === "sleep") {
    if (!lockedState && getTimePhase() !== "night") {
      if (stateTimer > 600) { showBubble("早安!", 3000); enter("idle"); }
    }
  }
}

// ---------- pomodoro timer (customizable) ----------
const pomoConfig = {
  work:   parseInt(localStorage.getItem("pomoWork"))   || 25,
  brk:    parseInt(localStorage.getItem("pomoBreak"))  || 5,
  rounds: parseInt(localStorage.getItem("pomoRounds")) || 4,
  pose:   localStorage.getItem("pomoPose")            || "lying",
};
const pomodoro = {
  active: false,
  phase: "work",      // "work" | "break"
  remaining: 0,       // seconds
  round: 0,           // current round (1-based)
  lastTick: 0,
};

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function startPomodoro() {
  pomoConfig.work = parseInt(pomoWorkInput.value);
  pomoConfig.brk = parseInt(pomoBreakInput.value);
  pomoConfig.rounds = parseInt(pomoRoundsInput.value);
  pomoConfig.pose = pomoPoseSelect.value;
  localStorage.setItem("pomoWork", pomoConfig.work);
  localStorage.setItem("pomoBreak", pomoConfig.brk);
  localStorage.setItem("pomoRounds", pomoConfig.rounds);
  localStorage.setItem("pomoPose", pomoConfig.pose);
  pomodoro.active = true;
  pomodoro.phase = "work";
  pomodoro.remaining = pomoConfig.work * 60;
  pomodoro.round = 1;
  pomodoro.lastTick = 0;
  lockedState = pomoConfig.pose;
  pomodoroItem.classList.toggle("check", true);
  pomodoroItem.classList.toggle("uncheck", false);
  enter(pomoConfig.pose);
  timerEl.style.display = "block";
  timerEl.textContent = fmtTime(pomodoro.remaining);
  showKeyboardForPomodoro({ reset: true });
  showBubble("开始专注! " + pomoConfig.work + "分钟 (第1/" + pomoConfig.rounds + "轮)", 3500);
}

function stopPomodoro() {
  pomodoro.active = false;
  lockedState = null;
  timerEl.style.display = "none";
  hideKeyboard();
  pomodoroItem.classList.toggle("check", false);
  pomodoroItem.classList.toggle("uncheck", true);
  showBubble("番茄钟已停止", 2000);
  setTimeout(flushSocialNotifications, 2200);
  enter("idle");
}

function endPomodoroPhase() {
  if (pomodoro.phase === "work") {
    // work phase done -> break: show keyboard summary, hide panel
    const { total, top } = getKeyboardSummary();
    const topText = top.join(" ");
    showBubble("休息一下吧! " + pomoConfig.brk + "分钟\n本轮敲了 " + total + " 键" + (topText ? " 热键:" + topText : ""), 6000);
    setTimeout(flushSocialNotifications, 6200);
    hideKeyboard();
    pomodoro.phase = "break";
    pomodoro.remaining = pomoConfig.brk * 60;
    lockedState = null;
    enter("happy");
    setTimeout(() => { if (pomodoro.active) enter("walk"); }, 2000);
  } else {
    // break done -> next round or finish
    if (pomodoro.round >= pomoConfig.rounds) {
      stopPomodoro();
      showBubble("全部 " + pomoConfig.rounds + " 轮完成!辛苦啦!", 5000);
      enter("happy");
      return;
    }
    pomodoro.round++;
    pomodoro.phase = "work";
    pomodoro.remaining = pomoConfig.work * 60;
    lockedState = pomoConfig.pose;
    showKeyboardForPomodoro({ reset: true });
    showBubble("第 " + pomodoro.round + "/" + pomoConfig.rounds + " 轮,开始专注!", 3500);
    enter(pomoConfig.pose);
  }
}

function updatePomodoro() {
  const now = Math.floor(Date.now() / 1000);
  if (!pomodoro.lastTick) pomodoro.lastTick = now;
  const elapsed = now - pomodoro.lastTick;
  if (elapsed >= 1) {
    pomodoro.remaining -= elapsed;
    pomodoro.lastTick = now;
    if (pomodoro.remaining <= 0) {
      endPomodoroPhase();
    } else {
      const label = pomodoro.phase === "work" ? "\u25CF" : "\u25CB";
      timerEl.textContent = label + fmtTime(pomodoro.remaining) + " " + pomodoro.round + "/" + pomoConfig.rounds;
    }
  }
}

// ---------- water reminder ----------
let waterEnabled = false;
let waterTimer = null;

function toggleWater() {
  waterEnabled = !waterEnabled;
  waterItem.classList.toggle("check", waterEnabled);
  waterItem.classList.toggle("uncheck", !waterEnabled);
  if (waterEnabled) {
    showBubble("喝水提醒已开启", 2000);
    waterTimer = setInterval(() => {
      if (pomodoro.active && pomodoro.phase === "work") return;
      if (state === "sleep" || state === "drag") return;
      enter("happy");
      showBubble("该喝水了!", 5000);
    }, 45 * 60 * 1000);
  } else {
    showBubble("喝水提醒已关闭", 2000);
    clearInterval(waterTimer);
    waterTimer = null;
  }
}

// ---------- battery guard ----------
let batteryLow = false;
if (navigator.getBattery) {
  navigator.getBattery().then(bat => {
    function checkBattery() {
      const low = bat.level < 0.20 && !bat.charging;
      if (low && !batteryLow) {
        batteryLow = true;
        showBubble("电量低啦!快去充电!", 5000);
        if (!lockedState && state !== "sleep") enter("happy");
      } else if (!low && batteryLow) {
        batteryLow = false;
      }
    }
    checkBattery();
    bat.addEventListener("levelchange", checkBattery);
    bat.addEventListener("chargingchange", checkBattery);
  });
}

// ---------- memos ----------
const memoDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatMemoDue(timestamp) {
  return memoDateFormatter.format(new Date(timestamp));
}

function toDatetimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function defaultMemoDueAt(now = Date.now()) {
  const date = new Date(now + 30 * 60_000);
  date.setSeconds(0, 0);
  const remainder = date.getMinutes() % 5;
  if (remainder) date.setMinutes(date.getMinutes() + 5 - remainder);
  return date.getTime();
}

function newMemoId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `memo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function replaceMemos(nextMemos) {
  try {
    const persistedMemos = getActiveMemos(nextMemos);
    localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(persistedMemos));
    memos = persistedMemos;
    renderMemoCount();
    if (memoPanel.style.display === "block") renderMemoList();
    return true;
  } catch (error) {
    console.error("[memo] failed to save:", error);
    return false;
  }
}

function renderMemoCount() {
  const count = getActiveMemos(memos).length;
  memoCount.textContent = String(count);
  memoCount.hidden = count === 0;
  memoItem.title = count ? `${count} 条未完成备忘录` : "备忘录";
}

function createMemoAction(symbol, title, action, id, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `memo-icon-btn ${className}`.trim();
  button.textContent = symbol;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.dataset.memoAction = action;
  button.dataset.memoId = id;
  return button;
}

function renderMemoList() {
  const activeMemos = getActiveMemos(memos);
  memoList.replaceChildren();
  if (!activeMemos.length) {
    const empty = document.createElement("div");
    empty.className = "memo-empty";
    empty.textContent = "还没有备忘录";
    memoList.appendChild(empty);
    return;
  }

  const now = Date.now();
  for (const memo of activeMemos) {
    const row = document.createElement("div");
    row.className = `memo-row${memo.dueAt <= now ? " overdue" : ""}`;

    const content = document.createElement("div");
    content.className = "memo-row-content";
    content.textContent = memo.content;

    const due = document.createElement("div");
    due.className = "memo-row-time";
    due.textContent = `${memo.dueAt <= now ? "已到期" : "到期"} · ${formatMemoDue(memo.dueAt)}`;

    const actions = document.createElement("div");
    actions.className = "memo-row-actions";
    actions.append(
      createMemoAction("✓", "完成", "complete", memo.id, "complete"),
      createMemoAction("✎", "编辑", "edit", memo.id),
      createMemoAction("×", "删除", "delete", memo.id, "delete"),
    );
    row.append(content, due, actions);
    memoList.appendChild(row);
  }
}

function openMemoForm(id = null) {
  editingMemoId = id;
  memoError.textContent = "";
  memoForm.hidden = false;
  memoList.hidden = true;
  memoAdd.hidden = true;
  const minimumDueAt = Math.ceil(Date.now() / 60_000) * 60_000;
  memoDueAt.min = toDatetimeLocalValue(minimumDueAt);

  if (id) {
    const memo = memos.find((item) => item.id === id);
    if (!memo) return;
    memoFormTitle.textContent = "编辑备忘录";
    memoContent.value = memo.content;
    memoDueAt.value = toDatetimeLocalValue(memo.dueAt);
  } else {
    memoFormTitle.textContent = "新建备忘录";
    memoContent.value = "";
    memoDueAt.value = toDatetimeLocalValue(defaultMemoDueAt());
  }
  setTimeout(() => memoContent.focus(), 0);
  void layoutContextMenu();
}

function closeMemoForm() {
  editingMemoId = null;
  memoForm.hidden = true;
  memoList.hidden = false;
  memoAdd.hidden = false;
  memoError.textContent = "";
}

function resumePetAfterMemo() {
  if (dragging) return;
  if (pomodoro.active && pomodoro.phase === "work") enter(pomoConfig.pose);
  else if (getTimePhase() === "night") enter("sleep");
  else enter("idle");
}

function checkDueMemos() {
  const now = Date.now();
  const dueMemos = getActiveMemos(memos).filter((memo) => memo.dueAt <= now);
  const nextMemo = getNextDueMemo(memos, now);
  const previousMemo = activeMemo;
  activeMemo = nextMemo;

  if (!activeMemo) {
    if (!previousMemo) return;
    activeMemoSignature = "";
    memoAlert.style.display = "none";
    memoSnoozeOptions.hidden = true;
    img.classList.remove("memo-due");
    if (!menuOpen) resumeKeyboardIfAllowed();
    resumePetAfterMemo();
    void applyWindowLayout();
    return;
  }

  const signature = `${activeMemo.id}:${activeMemo.updatedAt}:${dueMemos.length}`;
  const reminderChanged = signature !== activeMemoSignature;
  if (reminderChanged) {
    activeMemoSignature = signature;
    memoAlertContent.textContent = activeMemo.content;
    memoAlertDue.textContent = `到期：${formatMemoDue(activeMemo.dueAt)}`;
    memoAlertQueue.textContent = dueMemos.length > 1
      ? `还有 ${dueMemos.length - 1} 条待处理`
      : "";
    memoSnoozeOptions.hidden = true;
    memoSnoozeButton.setAttribute("aria-expanded", "false");
  }
  if (reminderChanged && memoPanel.style.display === "block") renderMemoList();
  bubble.style.display = "none";
  clearTimeout(bubbleTimer);
  img.classList.add("memo-due");
  if (!previousMemo) hideSocial();

  if (menuOpen) {
    void closeMenu();
    return;
  }
  memoAlert.style.display = "block";
  if (!previousMemo) suspendKeyboard();
  if (!dragging && state !== "wag") enter("wag");
  if (!previousMemo || reminderChanged) void applyWindowLayout();
}

memoAdd.addEventListener("click", (event) => {
  event.stopPropagation();
  openMemoForm();
});

memoCancel.addEventListener("click", (event) => {
  event.stopPropagation();
  closeMemoForm();
  void layoutContextMenu();
});

memoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const now = Date.now();
  const dueAt = new Date(memoDueAt.value).getTime();
  try {
    const nextMemos = editingMemoId
      ? updateMemo(memos, editingMemoId, { content: memoContent.value, dueAt }, now)
      : [...memos, createMemo({
          id: newMemoId(),
          content: memoContent.value,
          dueAt,
          now,
        })];
    if (!replaceMemos(nextMemos)) {
      memoError.textContent = "保存失败，请重试";
      return;
    }
    closeMemoForm();
    renderMemoList();
    checkDueMemos();
    await layoutContextMenu();
  } catch (error) {
    memoError.textContent = error.message || "请检查备忘内容和到期时间";
    await layoutContextMenu();
  }
});

memoList.addEventListener("click", async (event) => {
  event.stopPropagation();
  const button = event.target.closest("button[data-memo-action]");
  if (!button) return;
  const { memoAction, memoId } = button.dataset;
  if (memoAction === "edit") {
    openMemoForm(memoId);
    return;
  }
  const nextMemos = memoAction === "complete"
    ? completeMemo(memos, memoId)
    : deleteMemo(memos, memoId);
  if (!replaceMemos(nextMemos)) return;
  checkDueMemos();
  await layoutContextMenu();
});

memoCompleteButton.addEventListener("click", () => {
  if (!activeMemo) return;
  const nextMemos = completeMemo(memos, activeMemo.id);
  if (!replaceMemos(nextMemos)) return;
  checkDueMemos();
});

memoSnoozeButton.addEventListener("click", () => {
  memoSnoozeOptions.hidden = !memoSnoozeOptions.hidden;
  memoSnoozeButton.setAttribute(
    "aria-expanded",
    String(!memoSnoozeOptions.hidden),
  );
  void applyWindowLayout();
});

memoSnoozeOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-minutes]");
  if (!button || !activeMemo) return;
  const minutes = parseInt(button.dataset.minutes);
  const nextMemos = snoozeMemo(memos, activeMemo.id, minutes);
  if (!replaceMemos(nextMemos)) return;
  checkDueMemos();
});

// ---------- manual drag ----------
let dragging = false;
let grab = { x: 0, y: 0 };
let downScreen = { x: 0, y: 0 };
let dragWindowOffset = { x: 0, y: 0 };

img.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  // ensure the window has focus so keydown events are received
  win.setFocus().catch(() => {});
  dragging = true;
  hideSocial();
  grab = { x: e.screenX - pos.x, y: e.screenY - pos.y };
  downScreen = { x: e.screenX, y: e.screenY };
  suspendKeyboard();
  dragWindowOffset = { x: img.offsetLeft, y: img.offsetTop };
  if (pomodoro.active && pomodoro.phase === "work") {
    lockedState = null;
  }
  enter("drag");
});

window.addEventListener("mousemove", (e) => {
  if (!dragging || !(e.buttons & 1)) return;
  pos.x = e.screenX - grab.x;
  pos.y = e.screenY - grab.y;
  void setWindowPosition(windowPositionForPet(pos, dragWindowOffset));
});

window.addEventListener("mouseup", async (e) => {
  if (!dragging) return;
  dragging = false;
  const moved = Math.abs(e.screenX - downScreen.x) > 4 || Math.abs(e.screenY - downScreen.y) > 4;
  await refreshMonitorBounds();
  pos = clampPetPosition(pos, size, bounds);
  resumeKeyboardIfAllowed();
  await applyWindowLayout();
  if (pomodoro.active && pomodoro.phase === "work") {
    const resumePose = pomodoroResumePose(pomoConfig.pose);
    lockedState = resumePose;
    enter(resumePose);
  } else {
    enter(moved ? "idle" : "happy");
  }
});

// ---------- context menu ----------
function measureContextMenu() {
  ctxMenu.style.width = `${MENU_MIN_SIZE.width}px`;
  ctxMenu.style.maxHeight = "none";
  const maximum = {
    width: Math.min(MENU_MAX_WIDTH, bounds.width),
    height: bounds.height,
  };
  let measured = resolvePanelSize(
    {
      clientWidth: ctxMenu.clientWidth,
      clientHeight: ctxMenu.clientHeight,
      offsetWidth: ctxMenu.offsetWidth,
      offsetHeight: ctxMenu.offsetHeight,
      scrollWidth: ctxMenu.scrollWidth,
      scrollHeight: ctxMenu.scrollHeight,
    },
    MENU_MIN_SIZE,
    maximum,
  );
  ctxMenu.style.width = `${measured.width}px`;
  measured = resolvePanelSize(
    {
      clientWidth: ctxMenu.clientWidth,
      clientHeight: ctxMenu.clientHeight,
      offsetWidth: ctxMenu.offsetWidth,
      offsetHeight: ctxMenu.offsetHeight,
      scrollWidth: ctxMenu.scrollWidth,
      scrollHeight: ctxMenu.scrollHeight,
    },
    { width: measured.width, height: 0 },
    maximum,
  );
  return measured;
}

async function layoutContextMenu() {
  if (!menuOpen) return;
  const menuSize = measureContextMenu();
  const layout = calculateMenuLayout({
    petPosition: pos,
    petSize: size,
    petInsets: scaledPetInsets(state),
    menuSize,
    workArea: bounds,
  });

  img.style.left = `${layout.petOffset.x}px`;
  img.style.top = `${layout.petOffset.y}px`;
  ctxMenu.style.left = `${layout.menuOffset.x}px`;
  ctxMenu.style.top = `${layout.menuOffset.y}px`;
  ctxMenu.style.width = `${layout.menuSize.width}px`;
  ctxMenu.style.maxHeight = `${layout.menuSize.height}px`;
  await scheduleWindowGeometry({
    size: layout.windowSize,
    position: layout.windowPosition,
  });
}

async function openMenu() {
  if (menuOpen) return;
  hideSocial();
  menuOpen = true;
  suspendKeyboard();
  await refreshMonitorBounds();
  pos = clampPetPosition(pos, size, bounds);
  ctxMenu.style.display = "block";
  ctxMenu.style.bottom = "auto";
  await layoutContextMenu();
}

async function closeMenu() {
  if (!menuOpen) return;
  ctxMenu.style.display = "none";
  pomoPanel.style.display = "none";
  memoPanel.style.display = "none";
  closeMemoForm();
  document.getElementById("interactPanel").style.display = "none";
  menuOpen = false;
  if (activeMemo) {
    memoAlert.style.display = "block";
    if (!dragging) enter("wag");
  } else {
    resumeKeyboardIfAllowed();
  }
  await applyWindowLayout();
}

img.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (activeMemo) return;
  if (menuOpen) { void closeMenu(); return; }
  void openMenu();
});

document.addEventListener("click", (e) => {
  // click outside the menu while it's open -> close it
  if (menuOpen && !ctxMenu.contains(e.target)) void closeMenu();
});
document.addEventListener("contextmenu", (e) => {
  if (e.target !== img) {
    e.preventDefault();
    if (menuOpen) void closeMenu();
  }
});

ctxMenu.addEventListener("click", async (e) => {
  e.stopPropagation();
  const actionTarget = e.target.closest("[data-act]");
  if (!actionTarget || !ctxMenu.contains(actionTarget)) return;
  const act = actionTarget.dataset.act;
  // actions that should NOT close the menu (they open sub-panels)
  const keepOpen = act === "pomodoro" || act === "memo" || act === "interact";
  if (!keepOpen) await closeMenu();
  switch (act) {
    case "pomodoro":
      if (pomodoro.active) {
        stopPomodoro();
        await closeMenu();
      } else {
        // toggle inline panel; keep menu open so user can interact with it
        const isOpen = pomoPanel.style.display === "block";
        memoPanel.style.display = "none";
        closeMemoForm();
        document.getElementById("interactPanel").style.display = "none";
        pomoPanel.style.display = isOpen ? "none" : "block";
        if (!isOpen) {
          // sync controls with saved config
          pomoWorkInput.value = pomoConfig.work;
          pomoBreakInput.value = pomoConfig.brk;
          pomoRoundsInput.value = pomoConfig.rounds;
          pomoPoseSelect.value = pomoConfig.pose;
          workVal.textContent = pomoConfig.work + " 分";
          breakVal.textContent = pomoConfig.brk + " 分";
          roundsVal.textContent = pomoConfig.rounds + " 轮";
          updatePresetActive(pomoConfig.work);
        }
        await layoutContextMenu();
      }
      break;
    case "memo": {
      const isMemoOpen = memoPanel.style.display === "block";
      pomoPanel.style.display = "none";
      document.getElementById("interactPanel").style.display = "none";
      closeMemoForm();
      memoPanel.style.display = isMemoOpen ? "none" : "block";
      if (!isMemoOpen) renderMemoList();
      await layoutContextMenu();
      break;
    }
    case "social":
      showSocial();
      break;
    case "interact":
      // toggle the interaction sub-list
      const panel = document.getElementById("interactPanel");
      pomoPanel.style.display = "none";
      memoPanel.style.display = "none";
      closeMemoForm();
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      await layoutContextMenu();
      break;
    case "water":    toggleWater(); break;
    case "walk":     lockedState = null; enter("walk"); break;
    case "run":      lockedState = null; enter("run"); break;
    case "jump":     lockedState = null; enter("jump"); break;
    case "happy":    lockedState = null; enter("happy"); break;
    case "tilt":     lockedState = null; enter("tilt"); break;
    case "wag":      lockedState = null; enter("wag"); break;
    case "sniff":    lockedState = null; enter("sniff"); break;
    case "scratch":  lockedState = null; enter("scratch"); break;
    case "sit":      lockedState = null; enter("sit"); break;
    case "sleep":    lockedState = null; enter("lying"); break;
    case "reset":
      lockedState = null;
      pos = defaultPetPosition(bounds, W());
      void applyWindowLayout();
      enter("idle");
      break;
    case "resetSize":
      setSize(DEFAULT_SIZE);
      showBubble("已恢复默认大小", 2000);
      break;
    case "quit":     win.close(); break;
  }
});

// ---------- pomodoro panel interactions ----------
function updatePresetActive(workMin) {
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.preset) === workMin);
  });
}

// preset buttons: click to set work duration via slider
document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const v = parseInt(btn.dataset.preset);
    pomoWorkInput.value = v;
    workVal.textContent = v + " 分";
    updatePresetActive(v);
  });
});

// sliders: live-update labels and preset highlight
pomoWorkInput.addEventListener("input", (e) => {
  e.stopPropagation();
  const v = parseInt(pomoWorkInput.value);
  workVal.textContent = v + " 分";
  updatePresetActive(v);
});
pomoBreakInput.addEventListener("input", (e) => {
  e.stopPropagation();
  breakVal.textContent = pomoBreakInput.value + " 分";
});
pomoRoundsInput.addEventListener("input", (e) => {
  e.stopPropagation();
  roundsVal.textContent = pomoRoundsInput.value + " 轮";
});

// panel buttons
pomoPanel.addEventListener("click", async (e) => {
  e.stopPropagation();
  const act = e.target.dataset.act;
  if (act === "pomoCancel") {
    await closeMenu();
  } else if (act === "pomoStart") {
    await closeMenu();
    startPomodoro();
  }
});

// ---------- size control (mouse wheel) ----------
async function applySize() {
  img.style.width = size + "px";
  img.style.height = size + "px";
  window.__petSize = size;
  pos = clampPetPosition(pos, size, bounds);
  await applyWindowLayout();
}

configureKeyboardLayout((visible, panelSize) => {
  keyboardVisible = visible;
  if (panelSize) keyboardPanelSize = panelSize;
  void applyWindowLayout();
});

configureSocialLayout((visible, panelSize) => {
  socialVisible = visible;
  if (panelSize) socialPanelSize = panelSize;
  if (visible) suspendKeyboard();
  else if (!menuOpen && !activeMemo) resumeKeyboardIfAllowed();
  void applyWindowLayout();
});

configureSocialNotifications({
  onUnread(unread) {
    const badge = document.getElementById("socialUnread");
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread === 0;
  },
  onNotice(notice) {
    showBubble(notice, 5000);
  },
  isFocusActive() {
    return pomodoro.active && pomodoro.phase === "work";
  },
});

function setSize(newSize) {
  size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(newSize)));
  localStorage.setItem("petSize", size);
  void applySize();
}

img.addEventListener("wheel", (e) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 16 : -16;
  setSize(size + step);
}, { passive: false });

// ---------- init ----------
async function init() {
  if (typeof win.onScaleChanged === "function") {
    await win.onScaleChanged(async () => {
      await refreshMonitorBounds();
      if (menuOpen) await layoutContextMenu();
      else await applyWindowLayout();
    });
  }
  await refreshMonitorBounds(true);
  pos = defaultPetPosition(bounds, W());
  await applySize();
  renderMemoCount();
  checkDueMemos();

  const phase = getTimePhase();
  if (phase === "night") {
    showBubble("夜深了,我先睡了...", 3000);
    enter("sleep");
  } else if (phase === "midday") {
    showBubble("中午好呀!", 3000);
    enter("idle");
  } else {
    showBubble("你好呀!", 3000);
    enter("idle");
  }
  setInterval(tick, TICK_MS);
  setInterval(checkDueMemos, 1000);
  void initializeSocial().catch((error) => {
    console.error("[social] initialization failed:", error);
  });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkDueMemos();
});
window.addEventListener("focus", checkDueMemos);

init();
