// Border collie desktop pet — frame animation + behavior state machine
// Features: pomodoro timer, water reminder, time awareness, battery guard
import {
  KEYBOARD_PANEL_SIZE,
  configureKeyboardLayout,
  getKeyboardSummary,
  hideKeyboard,
  resumeKeyboard,
  setKeyboardPanelRect,
  showKeyboard,
  suspendKeyboard,
} from "./keyboard.js";
import {
  calculateKeyboardLayout,
  clampPetPosition,
  defaultPetPosition,
  monitorWorkAreaToLogical,
  pomodoroResumePose,
} from "./logic.js";

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
let size = parseInt(localStorage.getItem("petSize")) || DEFAULT_SIZE;
let keyboardVisible = false;
const W = () => size;
const TICK_MS = 33;

const ACTIONS = {
  idle:   { frames: [0, 1, 2, 3].map(i => `assets/idle_${i}.png`), fps: 1.5 },
  walk:   { frames: [0, 1, 2, 3].map(i => `assets/walk_right_${i}.png`), fps: 8 },
  run:    { frames: [0, 1, 2, 3].map(i => `assets/run_${i}.png`), fps: 10 },
  sit:    { frames: ["assets/sit_0.png", "assets/sit_1.png"], fps: 1.5 },
  lying:  { frames: ["assets/lying_0.png"], fps: 1 },
  sleep:  { frames: ["assets/sleep_0.png"], fps: 1 },
  jump:   { frames: [0, 1, 2].map(i => `assets/jump_${i}.png`), fps: 6 },
  wag:    { frames: [0, 1, 2, 3].map(i => `assets/wag_${i}.png`), fps: 4 },
  tilt:   { frames: ["assets/tilt_0.png", "assets/tilt_1.png"], fps: 5 },
  sniff:  { frames: ["assets/sniff_0.png", "assets/sniff_1.png"], fps: 2 },
  scratch:{ frames: ["assets/scratch_0.png", "assets/scratch_1.png"], fps: 4 },
  happy:  { frames: ["assets/tilt_0.png", "assets/tilt_1.png"], fps: 5 },
  drag:   { frames: ["assets/tilt_0.png"], fps: 1 },
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

let state = "idle";
let frameIdx = 0;
let stateTimer = 0;
let stateDuration = 120;
let idleStreak = 0;
let dir = 1;
let pos = { x: 0, y: 0 };
let bounds = { x: 0, y: 0, width: 1280, height: 800 };
let menuOpen = false;
let menuLayout = null;
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

async function applyWindowLayout() {
  if (menuOpen) return;
  pos = clampPetPosition(pos, size, bounds);

  if (!keyboardVisible) {
    img.style.left = "0";
    img.style.top = "0";
    bubble.style.left = "50%";
    bubble.style.top = "4px";
    timerEl.style.left = "auto";
    timerEl.style.top = "4px";
    timerEl.style.right = "4px";
    timerEl.style.transform = "none";
    await setWindowSize(size, size);
    await setWindowPosition(pos);
    return;
  }

  const insetScale = size / DEFAULT_SIZE;
  const baseInsets = FOCUS_POSE_VISUAL_INSETS[pomoConfig.pose]
    ?? FOCUS_POSE_VISUAL_INSETS.lying;
  const petInsets = Object.fromEntries(
    Object.entries(baseInsets).map(([edge, value]) => [
      edge,
      Math.round(value * insetScale),
    ]),
  );
  const layout = calculateKeyboardLayout({
    petPosition: pos,
    petSize: size,
    petInsets,
    panelSize: KEYBOARD_PANEL_SIZE,
    workArea: bounds,
  });
  img.style.left = `${layout.petOffset.x}px`;
  img.style.top = `${layout.petOffset.y}px`;
  bubble.style.left = `${layout.petOffset.x + size / 2}px`;
  bubble.style.top = `${layout.petOffset.y + petInsets.top - 4}px`;
  timerEl.style.left = `${layout.petOffset.x + size - 4}px`;
  timerEl.style.top = `${layout.petOffset.y + petInsets.top}px`;
  timerEl.style.right = "auto";
  timerEl.style.transform = "translateX(-100%)";
  setKeyboardPanelRect({
    x: layout.panelOffset.x,
    y: layout.panelOffset.y,
    width: KEYBOARD_PANEL_SIZE.width,
    height: KEYBOARD_PANEL_SIZE.height,
    placement: layout.placement,
    pointerOffset: layout.pointerOffset,
  });
  await setWindowSize(layout.windowSize.width, layout.windowSize.height);
  await setWindowPosition(layout.windowPosition);
}

let bubbleTimer = null;
function showBubble(text, ms = 4000) {
  bubble.textContent = text;
  bubble.style.display = "block";
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.style.display = "none"; }, ms);
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
  if (lockedState && s !== "drag" && s !== lockedState) s = lockedState;
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

  // skip movement while the context menu is open (window is enlarged)
  if (menuOpen) return;

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
  showKeyboard({ reset: true });
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
  enter("idle");
}

function endPomodoroPhase() {
  if (pomodoro.phase === "work") {
    // work phase done -> break: show keyboard summary, hide panel
    const { total, top } = getKeyboardSummary();
    const topText = top.join(" ");
    showBubble("休息一下吧! " + pomoConfig.brk + "分钟\n本轮敲了 " + total + " 键" + (topText ? " 热键:" + topText : ""), 6000);
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
    showKeyboard({ reset: true });
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

// ---------- manual drag ----------
let dragging = false;
let grab = { x: 0, y: 0 };
let downScreen = { x: 0, y: 0 };

img.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  // ensure the window has focus so keydown events are received
  win.setFocus().catch(() => {});
  dragging = true;
  grab = { x: e.screenX - pos.x, y: e.screenY - pos.y };
  downScreen = { x: e.screenX, y: e.screenY };
  suspendKeyboard();
  if (pomodoro.active && pomodoro.phase === "work") {
    lockedState = null;
  }
  enter("drag");
});

window.addEventListener("mousemove", (e) => {
  if (!dragging || !(e.buttons & 1)) return;
  pos.x = e.screenX - grab.x;
  pos.y = e.screenY - grab.y;
  void setWindowPosition(pos);
});

window.addEventListener("mouseup", async (e) => {
  if (!dragging) return;
  dragging = false;
  const moved = Math.abs(e.screenX - downScreen.x) > 4 || Math.abs(e.screenY - downScreen.y) > 4;
  await refreshMonitorBounds();
  pos = clampPetPosition(pos, size, bounds);
  resumeKeyboard();
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
const MENU_W = 220;
const MENU_H = 520;

function positionContextMenu() {
  if (!menuLayout) return;
  const top = menuLayout.placeAbove
    ? menuLayout.availableHeight - ctxMenu.offsetHeight
    : menuLayout.petSize;
  ctxMenu.style.top = `${Math.max(0, top)}px`;
}

async function openMenu() {
  suspendKeyboard();
  await applyWindowLayout();
  menuOpen = true;

  const petSize = size;
  const topEdge = bounds.y;
  const bottomEdge = bounds.y + bounds.height;
  const spaceAbove = Math.max(0, pos.y - topEdge);
  const spaceBelow = Math.max(0, bottomEdge - (pos.y + petSize));
  const placeAbove = spaceAbove >= spaceBelow;
  const menuHeight = Math.min(MENU_H, Math.max(spaceAbove, spaceBelow));
  const newW = Math.max(MENU_W, petSize);
  const newH = menuHeight + petSize;
  const newY = placeAbove ? pos.y - menuHeight : pos.y;
  const petTop = placeAbove ? menuHeight : 0;
  let newX = Math.round(pos.x - (newW - petSize) / 2);
  newX = Math.max(
    bounds.x,
    Math.min(newX, bounds.x + bounds.width - newW),
  );

  await setWindowSize(newW, newH);
  await setWindowPosition({ x: newX, y: newY });

  img.style.left = Math.round((newW - petSize) / 2) + "px";
  img.style.top = petTop + "px";

  ctxMenu.style.display = "block";
  ctxMenu.style.maxHeight = menuHeight + "px";
  ctxMenu.style.left = "4px";
  ctxMenu.style.bottom = "auto";
  ctxMenu.style.width = (MENU_W - 8) + "px";
  menuLayout = { placeAbove, availableHeight: menuHeight, petSize };
  positionContextMenu();
}

function closeMenu() {
  if (!menuOpen) return;
  ctxMenu.style.display = "none";
  pomoPanel.style.display = "none";
  document.getElementById("interactPanel").style.display = "none";
  menuOpen = false;
  menuLayout = null;
  resumeKeyboard();
  void applyWindowLayout();
}

img.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (menuOpen) { closeMenu(); return; }
  void openMenu();
});

document.addEventListener("click", (e) => {
  // click outside the menu while it's open -> close it
  if (menuOpen && !ctxMenu.contains(e.target)) closeMenu();
});
document.addEventListener("contextmenu", (e) => {
  if (e.target !== img) {
    e.preventDefault();
    if (menuOpen) closeMenu();
  }
});

ctxMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const act = e.target.dataset.act;
  if (!act) return;
  // actions that should NOT close the menu (they open sub-panels)
  const keepOpen = act === "pomodoro" || act === "interact";
  if (!keepOpen) closeMenu();
  switch (act) {
    case "pomodoro":
      if (pomodoro.active) {
        stopPomodoro();
        closeMenu();
      } else {
        // toggle inline panel; keep menu open so user can interact with it
        const isOpen = pomoPanel.style.display === "block";
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
        positionContextMenu();
      }
      break;
    case "interact":
      // toggle the interaction sub-list
      const panel = document.getElementById("interactPanel");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      positionContextMenu();
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
pomoPanel.addEventListener("click", (e) => {
  e.stopPropagation();
  const act = e.target.dataset.act;
  if (act === "pomoCancel") {
    closeMenu();
  } else if (act === "pomoStart") {
    closeMenu();
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

configureKeyboardLayout((visible) => {
  keyboardVisible = visible;
  void applyWindowLayout();
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
  await refreshMonitorBounds(true);
  pos = defaultPetPosition(bounds, W());
  await applySize();

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
}

init();
