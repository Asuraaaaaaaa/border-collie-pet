// Virtual keyboard panel — shows during pomodoro work phase.
// Listens to Rust-emitted "global-keydown" events (via rdev).
// Falls back to window keydown when rdev has no permission.
// Highlights pressed keys, tracks count / WPM / top-5 hot keys.

const kbPanel = document.getElementById("kbPanel");
const kbBoard = document.getElementById("kbBoard");
const kbCount = document.getElementById("kbCount");
const kbWpm = document.getElementById("kbWpm");
const kbTop5 = document.getElementById("kbTop5");

// 104-key layout: each sub-array = one physical row.
// [label, code, flex?]  flex defaults to 1; "wide-N" = N units wide.
const KB_LAYOUT = [
  // function row
  [["Esc","Escape"],["F1"],["F2"],["F3"],["F4"],["F5"],["F6"],["F7"],["F8"],["F9"],["F10"],["F11"],["F12"]],
  // number row
  [["`","Backquote"],["1","Digit1"],["2","Digit2"],["3","Digit3"],["4","Digit4"],["5","Digit5"],["6","Digit6"],["7","Digit7"],["8","Digit8"],["9","Digit9"],["0","Digit0"],["-","Minus"],["=","Equal"],["⌫","Backspace","wide-2"]],
  // qwerty row
  [["Tab","Tab","wide-2"],["Q","KeyQ"],["W","KeyW"],["E","KeyE"],["R","KeyR"],["T","KeyT"],["Y","KeyY"],["U","KeyU"],["I","KeyI"],["O","KeyO"],["P","KeyP"],["[","BracketLeft"],["]","BracketRight"],["\\","Backslash","wide-2"]],
  // asdf row
  [["Caps","CapsLock","wide-2"],["A","KeyA"],["S","KeyS"],["D","KeyD"],["F","KeyF"],["G","KeyG"],["H","KeyH"],["J","KeyJ"],["K","KeyK"],["L","KeyL"],[";","Semicolon"],["'","Quote"],["Enter","Enter","wide-3"]],
  // zxcv row
  [["Shift","ShiftLeft","wide-3"],["Z","KeyZ"],["X","KeyX"],["C","KeyC"],["V","KeyV"],["B","KeyB"],["N","KeyN"],["M","KeyM"],[",","Comma"],[".","Period"],["/","Slash"],["Shift","ShiftRight","wide-3"]],
  // bottom row
  [["Ctrl","ControlLeft"],["Alt","AltLeft"],["Space","Space","wide-6"],["Alt","AltRight"],["Ctrl","ControlRight"]],
];

// build the DOM
const keyEls = {}; // code -> element
KB_LAYOUT.forEach(row => {
  const rowEl = document.createElement("div");
  rowEl.className = "kb-row";
  row.forEach(([label, code, flex]) => {
    const k = document.createElement("div");
    k.className = "kb-key" + (flex ? " " + flex : "");
    k.textContent = label;
    k.dataset.code = code;
    keyEls[code] = k;
    rowEl.appendChild(k);
  });
  kbBoard.appendChild(rowEl);
});

// stats
let kbTotal = 0;
let kbKeyMap = {};        // code -> count
let kbRecentTimes = [];   // timestamps of recent keypresses for WPM

function kbReset() {
  kbTotal = 0;
  kbKeyMap = {};
  kbRecentTimes = [];
  kbCount.textContent = "0 键";
  kbWpm.textContent = "0 WPM";
  kbTop5.innerHTML = "";
}

const KB_WIDTH = 340;

function getKbT() { return window.__TAURI__; }

function kbShow() {
  const kbT = getKbT();
  if (!kbPanel) return;
  kbPanel.style.display = "block";
  kbReset();
  // position panel to the right of the pet, and expand window width
  try {
    const petSize = window.__petSize || 160;
    kbPanel.style.left = petSize + "px";
    const newW = petSize + KB_WIDTH;
    const curWin = kbT.window.getCurrentWindow();
    curWin.setSize(new kbT.window.LogicalSize(newW, petSize));
  } catch (e) {
    console.error("[kb] window resize failed:", e);
  }
}

function kbHide() {
  const kbT = getKbT();
  kbPanel.style.display = "none";
  // shrink window back to pet size only
  try {
    const petSize = window.__petSize || 160;
    kbT.window.getCurrentWindow().setSize(new kbT.window.LogicalSize(petSize, petSize));
  } catch (e) {
    console.error("[kb] window shrink failed:", e);
  }
}

function kbOnKey(code) {
  kbTotal++;
  kbKeyMap[code] = (kbKeyMap[code] || 0) + 1;
  kbRecentTimes.push(Date.now());

  // highlight
  const el = keyEls[code];
  if (el) {
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 180);
  }

  // count
  kbCount.textContent = kbTotal + " 键";

  // WPM: count keys in last 5 seconds, extrapolate to per-minute / 5 (avg word length)
  const now = Date.now();
  kbRecentTimes = kbRecentTimes.filter(t => now - t < 5000);
  const recentCount = kbRecentTimes.length;
  const wpm = Math.round(recentCount / 5 * 60 / 5);
  kbWpm.textContent = wpm + " WPM";

  // top 5 hot keys
  const sorted = Object.entries(kbKeyMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = sorted.length ? sorted[0][1] : 1;
  kbTop5.innerHTML = sorted.map(([code, cnt]) => {
    const label = code.replace(/^Key|^Digit/, "").replace(/^Numpad/, "N");
    const w = Math.round(cnt / maxCount * 40);
    return `<span class="hot-key">${label}<span class="bar" style="width:${w}px"></span></span>`;
  }).join("");
}

// Listen for Rust-emitted global key events (rdev backend).
// Also listen to window keydown as a fallback when rdev fails (no permission).
// Deferred init: Tauri injects window.__TAURI__ after DOMContentLoaded.
let kbBackend = "none"; // "rdev" | "fallback" | "none"

function initKbListeners() {
  const kbT = getKbT();
  if (!kbT || !kbT.event || !kbT.event.listen) return;

  kbT.event.listen("global-keydown", (event) => {
    if (kbPanel.style.display !== "none") {
      if (kbBackend !== "rdev") kbBackend = "rdev";
      kbOnKey(event.payload);
    }
  });

  // rdev failed — fall back to window keydown + show permission hint
  kbT.event.listen("kb-listen-error", () => {
    kbBackend = "fallback";
    kbShowPermHint();
  });
}

// Fallback: window keydown listener (only fires when pet window has focus).
window.addEventListener("keydown", (e) => {
  if (kbPanel.style.display === "none") return;
  if (kbBackend === "rdev") return; // rdev is working, don't double-count
  kbBackend = "fallback";
  if (e.code) kbOnKey(e.code);
});

function kbShowPermHint() {
  if (kbPanel.style.display === "none") return;
  const hint = document.createElement("div");
  hint.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:11px;color:#ff9;text-align:center;padding:8px;line-height:1.5;";
  hint.innerHTML = "窗口内监听模式<br>点一下宠物获取焦点后打字<br>即可高亮按键";
  kbPanel.appendChild(hint);
  setTimeout(() => hint.remove(), 6000);
}

// init after DOM is ready (Tauri injects __TAURI__ after page load)
if (document.readyState === "complete" || document.readyState === "interactive") {
  initKbListeners();
} else {
  document.addEventListener("DOMContentLoaded", initKbListeners);
}
