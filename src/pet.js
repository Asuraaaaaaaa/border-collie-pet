// Border collie desktop pet — frame animation + behavior state machine
const T = window.__TAURI__;
const win = T.window.getCurrentWindow();
const LogicalPosition = T.window.LogicalPosition;

const W = 240; // window size (logical px)

const ACTIONS = {
  idle:  { frames: ["assets/idle_0.png", "assets/idle_1.png"], fps: 1.5 },
  walk:  { frames: [0, 1, 2, 3].map(i => `assets/walk_${i}.png`), fps: 8 },
  run:   { frames: [0, 1, 2, 3].map(i => `assets/run_${i}.png`), fps: 10 },
  happy: { frames: ["assets/happy_0.png", "assets/happy_1.png"], fps: 5 },
  drag:  { frames: ["assets/happy_0.png"], fps: 1 },   // head tilt while carried
  lying: { frames: ["assets/lying_0.png"], fps: 1 },
  sleep: { frames: ["assets/sleep_0.png"], fps: 1 },
};

// how long (ticks, 1 tick = 33ms) of uninterrupted idling before the dog naps
const SLEEP_AFTER = 2400; // ~80s
const SPEEDS = { walk: 3, run: 7 };

// Preload all frames to avoid flicker on first switch
for (const a of Object.values(ACTIONS)) {
  for (const src of a.frames) {
    const im = new Image();
    im.src = src;
  }
}

const img = document.getElementById("pet");

let state = "idle";
let frameIdx = 0;
let stateTimer = 0;
let stateDuration = 120;
let idleStreak = 0;      // consecutive ticks spent in idle (for the nap timer)
let dir = 1;             // 1 = facing right, -1 = facing left
let pos = { x: 0, y: 0 };
let bounds = { w: 1280, h: 800 };

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

function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function enter(s) {
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
  } else if (s === "happy") {
    stateDuration = 32;
  } else if (s === "lying") {
    stateDuration = 90;    // pause on lying down, then fall asleep
  } else {
    stateDuration = Infinity; // drag, sleep
  }
  startAnim();
}

// ---------- behavior loop ----------
function tick() {
  stateTimer++;
  if (state === "walk" || state === "run") {
    pos.x += dir * SPEEDS[state];
    if (pos.x <= 0) { pos.x = 0; dir = 1; img.classList.remove("flip"); }
    if (pos.x >= bounds.w - W) { pos.x = bounds.w - W; dir = -1; img.classList.add("flip"); }
    win.setPosition(new LogicalPosition(Math.round(pos.x), Math.round(pos.y)));
    if (stateTimer > stateDuration) enter(Math.random() < 0.75 ? "idle" : "happy");
  } else if (state === "idle") {
    idleStreak++;
    if (idleStreak > SLEEP_AFTER) { enter("lying"); return; }
    if (stateTimer > stateDuration) {
      const r = Math.random();
      enter(r < 0.50 ? "walk" : r < 0.65 ? "run" : r < 0.80 ? "happy" : "idle");
    }
  } else if (state === "happy") {
    if (stateTimer > stateDuration) enter("idle");
  } else if (state === "lying") {
    if (stateTimer > stateDuration) enter("sleep");
  }
  // sleep: do nothing until the user wakes the dog
}

// ---------- manual drag (works the same on macOS and Windows) ----------
let dragging = false;
let grab = { x: 0, y: 0 };
let downScreen = { x: 0, y: 0 };

img.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  grab = { x: e.clientX, y: e.clientY };
  downScreen = { x: e.screenX, y: e.screenY };
  enter("drag"); // also wakes the dog from sleep
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
  // a quick click (no real move) = play with the puppy / wake it up
  enter(moved ? "idle" : "happy");
});

// ---------- custom Chinese context menu (replaces English WebView default) ----------
const ctxMenu = document.getElementById("ctxMenu");

img.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ctxMenu.style.display = "block";
  const mx = Math.min(e.clientX, W - 150);
  const my = Math.min(e.clientY, W - 200);
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
    case "walk":  enter("walk"); break;
    case "run":   enter("run"); break;
    case "happy": enter("happy"); break;
    case "sleep": enter("lying"); break;
    case "reset":
      pos.x = Math.round(bounds.w - W - 120);
      pos.y = Math.round(bounds.h - W - 90);
      win.setPosition(new LogicalPosition(pos.x, pos.y));
      enter("idle");
      break;
    case "quit":
      win.close();
      break;
  }
});

// ---------- init ----------
async function init() {
  const monitor = await T.window.primaryMonitor();
  const sf = monitor.scaleFactor;
  bounds.w = monitor.size.width / sf;
  bounds.h = monitor.size.height / sf;
  // start at bottom-right, hovering above the Dock / taskbar
  pos.x = Math.round(bounds.w - W - 120);
  pos.y = Math.round(bounds.h - W - 90);
  await win.setPosition(new LogicalPosition(pos.x, pos.y));
  enter("idle");
  setInterval(tick, 33);
}

init();
