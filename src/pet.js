// Border collie desktop pet — frame animation + behavior state machine
// Features: pomodoro timer, water reminder, time awareness, battery guard
const T = window.__TAURI__;
const win = T.window.getCurrentWindow();
const LogicalPosition = T.window.LogicalPosition;

const MIN_SIZE = 100;
const MAX_SIZE = 320;
const DEFAULT_SIZE = 160;
let size = parseInt(localStorage.getItem("petSize")) || DEFAULT_SIZE;
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

let state = "idle";
let frameIdx = 0;
let stateTimer = 0;
let stateDuration = 120;
let idleStreak = 0;
let dir = 1;
let pos = { x: 0, y: 0 };
let bounds = { w: 1280, h: 800 };

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

  if (state === "walk" || state === "run") {
    pos.x += dir * SPEEDS[state];
    if (pos.x <= 0) { pos.x = 0; dir = 1; img.classList.remove("flip"); }
    if (pos.x >= bounds.w - W()) { pos.x = bounds.w - W(); dir = -1; img.classList.add("flip"); }
    win.setPosition(new LogicalPosition(Math.round(pos.x), Math.round(pos.y)));
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

// ---------- pomodoro timer ----------
const pomodoro = {
  active: false,
  phase: "work",     // "work" | "break"
  remaining: 0,      // seconds
};

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function startPomodoro() {
  pomodoro.active = true;
  pomodoro.phase = "work";
  pomodoro.remaining = 25 * 60;
  pomodoro.lastTick = 0;
  lockedState = "lying";
  pomodoroItem.classList.toggle("check", true);
  pomodoroItem.classList.toggle("uncheck", false);
  enter("lying");
  timerEl.style.display = "block";
  timerEl.textContent = fmtTime(pomodoro.remaining);
  showBubble("开始专注!25分钟", 3000);
}

function endPomodoroPhase() {
  if (pomodoro.phase === "work") {
    showBubble("休息一下吧!5分钟", 5000);
    pomodoro.phase = "break";
    pomodoro.remaining = 5 * 60;
    lockedState = null;
    enter("happy");
    setTimeout(() => { if (pomodoro.active) enter("walk"); }, 2000);
  } else {
    pomodoro.active = false;
    lockedState = null;
    timerEl.style.display = "none";
    pomodoroItem.classList.toggle("check", false);
    pomodoroItem.classList.toggle("uncheck", true);
    showBubble("番茄钟结束,继续加油!", 3000);
    enter("idle");
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
      timerEl.textContent = fmtTime(pomodoro.remaining);
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
  dragging = true;
  grab = { x: e.clientX, y: e.clientY };
  downScreen = { x: e.screenX, y: e.screenY };
  if (pomodoro.active && pomodoro.phase === "work") {
    lockedState = null;
  }
  enter("drag");
});

window.addEventListener("mousemove", (e) => {
  if (!dragging || !(e.buttons & 1)) return;
  pos.x = e.screenX - grab.x;
  pos.y = e.screenY - grab.y;
  win.setPosition(new LogicalPosition(Math.round(pos.x), Math.round(pos.y)));
});

window.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  dragging = false;
  const moved = Math.abs(e.screenX - downScreen.x) > 4 || Math.abs(e.screenY - downScreen.y) > 4;
  if (pomodoro.active && pomodoro.phase === "work") {
    lockedState = "lying";
    enter("lying");
  } else {
    enter(moved ? "idle" : "happy");
  }
});

// ---------- context menu ----------
img.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ctxMenu.style.display = "block";
  // estimate menu height so we can flip it upward when near the bottom
  const menuH = Math.min(ctxMenu.scrollHeight, 220);
  const menuW = 150;
  const mx = Math.max(0, Math.min(e.clientX, W() - menuW - 4));
  let my = e.clientY;
  if (my + menuH > W() - 4) my = Math.max(2, W() - menuH - 4);
  ctxMenu.style.left = mx + "px";
  ctxMenu.style.top = my + "px";
});

document.addEventListener("click", () => { ctxMenu.style.display = "none"; });
document.addEventListener("contextmenu", (e) => {
  if (e.target !== img) { e.preventDefault(); ctxMenu.style.display = "none"; }
});

ctxMenu.addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  ctxMenu.style.display = "none";
  switch (act) {
    case "pomodoro":
      if (pomodoro.active) {
        pomodoro.active = false;
        lockedState = null;
        timerEl.style.display = "none";
        pomodoroItem.classList.toggle("check", false);
        pomodoroItem.classList.toggle("uncheck", true);
        showBubble("番茄钟已取消", 2000);
        enter("idle");
      } else {
        startPomodoro();
      }
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
      pos.x = Math.round(bounds.w - W() - 120);
      pos.y = Math.round(bounds.h - W() - 90);
      win.setPosition(new LogicalPosition(pos.x, pos.y));
      enter("idle");
      break;
    case "resetSize":
      setSize(DEFAULT_SIZE);
      showBubble("已恢复默认大小", 2000);
      break;
    case "quit":     win.close(); break;
  }
});

// ---------- size control (mouse wheel) ----------
function applySize() {
  img.style.width = size + "px";
  img.style.height = size + "px";
  win.setSize(new T.window.LogicalSize(size, size)).catch(() => {});
}

function setSize(newSize) {
  size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(newSize)));
  localStorage.setItem("petSize", size);
  applySize();
}

img.addEventListener("wheel", (e) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 16 : -16;
  setSize(size + step);
}, { passive: false });

// ---------- init ----------
async function init() {
  const monitor = await T.window.primaryMonitor();
  const sf = monitor.scaleFactor;
  bounds.w = monitor.size.width / sf;
  bounds.h = monitor.size.height / sf;
  applySize();
  pos.x = Math.round(bounds.w - W() - 120);
  pos.y = Math.round(bounds.h - W() - 90);
  await win.setPosition(new LogicalPosition(pos.x, pos.y));

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
