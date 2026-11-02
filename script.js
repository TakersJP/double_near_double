"use strict";

// ================================================================
// Maths
// ----------------------------------------------------------------
// Every double n + n (answers 2..40, even) and near double
// n + (n + 1) (answers 3..39, odd) has a unique answer, so the answer
// alone identifies a challenge. 8 + 9 and 9 + 8 are the same challenge;
// `first` records which way round it is shown.
// ================================================================

const MAX_ADDEND = 20;
const MIN_ANSWER = 2;
const MAX_ANSWER = MAX_ADDEND * 2;
const STORAGE_KEY = "bingoDoublesState.v3";
const PREFS_KEY = "bingoDoublesPrefs.v1";

const CHEERS = [
  "Super star! ⭐", "You got it! 🎯", "Brilliant! ✨", "Double power! 💪",
  "Awesome! 🚀", "Fantastic! 🌈", "Way to go! 🙌", "Math magic! 🪄",
];

/** Returns { a, b, answer, isDouble } for `a + b`, or null if it isn't a valid challenge. */
function challengeFor(answer, first = Math.floor(answer / 2)) {
  if (!Number.isInteger(answer) || answer < MIN_ANSWER || answer > MAX_ANSWER) return null;
  const a = first;
  const b = answer - a;
  if (!Number.isInteger(a) || Math.abs(a - b) > 1) return null;
  return { a, b, answer, isDouble: a === b };
}

/** Turns an answer into a challenge shown either way round (8 + 9 or 9 + 8). */
function makeItem(answer) {
  const small = Math.floor(answer / 2);
  const first = Math.random() < 0.5 ? small : answer - small;
  return { answer, first };
}

const itemChallenge = (item) => item && challengeFor(item.answer, item.first);

function allAnswers() {
  const list = [];
  for (let n = MIN_ANSWER; n <= MAX_ANSWER; n++) list.push(n);
  return list;
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Splits typed text into usable Bingo answers and ones no challenge can make. */
function parseAnswers(text) {
  const tokens = [...new Set(text.match(/-?\d+(\.\d+)?/g) || [])];
  const valid = [];
  const invalid = [];
  for (const token of tokens) {
    (challengeFor(Number(token)) ? valid : invalid).push(token);
  }
  return { valid: valid.map(Number).sort((x, y) => x - y), invalid };
}

// ================================================================
// State & preferences
// ================================================================

const state = {
  mode: "all",   // "all" | "bingo"
  answers: [],   // Bingo card answers (used in Bingo mode)
  history: [],   // challenges shown so far, in order: { answer, first }
  index: -1,     // position in history currently on screen
  deck: [],      // answers still to draw this round
  round: 1,
  revealed: false,
};

const prefs = {
  sound: true,
  timerSeconds: 10,
  autoTimer: false,
};

function pool() {
  return state.mode === "bingo" ? state.answers.slice() : allAnswers();
}

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function save() {
  const { revealed, ...saved } = state;
  store(STORAGE_KEY, saved);
}

/** Restores the last session; returns false if there is nothing valid to restore. */
function load() {
  const saved = read(STORAGE_KEY);
  if (!saved || !Array.isArray(saved.history) || !Array.isArray(saved.deck)) return false;

  // Re-validate so a bad stored value can never reach the screen.
  const isValid = (n) => challengeFor(n) !== null;
  if (saved.history.length === 0 || !saved.history.every(itemChallenge)) return false;

  state.answers = (saved.answers || []).filter(isValid);
  state.mode = saved.mode === "bingo" && state.answers.length ? "bingo" : "all";
  state.history = saved.history;
  state.index = Math.min(Math.max(0, saved.index | 0), saved.history.length - 1);
  state.deck = saved.deck.filter(isValid);
  state.round = saved.round || 1;
  return true;
}

function loadPrefs() {
  const saved = read(PREFS_KEY) || {};
  if (typeof saved.sound === "boolean") prefs.sound = saved.sound;
  if ([5, 10, 15, 20, 30].includes(saved.timerSeconds)) prefs.timerSeconds = saved.timerSeconds;
  if (typeof saved.autoTimer === "boolean") prefs.autoTimer = saved.autoTimer;
}

/** Takes the next answer from the deck, reshuffling when a round is used up. */
function draw() {
  const answers = pool();
  if (answers.length === 0) return null;

  if (state.deck.length === 0) {
    state.deck = shuffle(answers);
    state.round++;
    // Don't show the same challenge twice in a row across rounds.
    const last = state.history[state.history.length - 1];
    if (state.deck.length > 1 && state.deck[0] === last.answer) {
      [state.deck[0], state.deck[1]] = [state.deck[1], state.deck[0]];
    }
    showToast(`All ${answers.length} challenges used — shuffled for a new round!`);
  }
  return makeItem(state.deck.shift());
}

// ================================================================
// Sound effects (synthesised with Web Audio, so no files or internet)
// ================================================================

const sound = (() => {
  let ctx = null;

  function context() {
    if (!prefs.sound) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, delay, duration, { type = "sine", volume = 0.2, slideTo } = {}) {
    const ac = context();
    if (!ac) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  const melody = (notes, step, opts) =>
    notes.forEach((freq, i) => tone(freq, i * step, i === notes.length - 1 ? step * 4 : step * 1.6, opts));

  return {
    pop: () => tone(440, 0, 0.15, { slideTo: 900, volume: 0.25 }),
    tick: () => tone(1100, 0, 0.05, { type: "square", volume: 0.04 }),
    tickUrgent: () => tone(1500, 0, 0.08, { type: "square", volume: 0.07 }),
    timesUp: () => {
      tone(392, 0, 0.25, { type: "triangle", volume: 0.3 });
      tone(262, 0.25, 0.5, { type: "triangle", volume: 0.3 });
    },
    tada: () => melody([523, 659, 784, 1047], 0.09, { type: "triangle", volume: 0.25 }),
    fanfare: () => melody([392, 523, 659, 784, 659, 784, 1047], 0.13, { type: "triangle", volume: 0.3 }),
  };
})();

// ================================================================
// Confetti
// ================================================================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const confetti = (() => {
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#D3C6F1", "#9B87E0", "#C2E6EC", "#5FB8CC", "#F5C6D6", "#E77FA0", "#D8EBC1", "#7CBF6B", "#F9E3A5", "#E8B33C"];
  let pieces = [];
  let running = false;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Fires `count` pieces from (x, y) in a cone around `angle` (degrees, 0 = up). */
  function burst(x, y, { count = 80, angle = 0, spread = 70, power = 1 } = {}) {
    if (reduceMotion) return;
    const unit = Math.min(innerWidth, innerHeight * 1.78) / 100;
    for (let i = 0; i < count; i++) {
      const dir = ((angle + (Math.random() - 0.5) * spread * 2) * Math.PI) / 180;
      const speed = unit * power * (0.6 + Math.random() * 0.9);
      pieces.push({
        x, y,
        vx: Math.sin(dir) * speed,
        vy: -Math.cos(dir) * speed,
        size: unit * (0.5 + Math.random() * 0.6),
        color: pick(COLORS),
        round: Math.random() < 0.3,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        gravity: unit * 0.035,
      });
    }
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    pieces = pieces.filter((p) => p.y < innerHeight + 50);
    if (pieces.length) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  resize();
  window.addEventListener("resize", resize);
  return { burst };
})();

// ================================================================
// Think Time countdown
// ================================================================

const timer = {
  id: null,
  remaining: 0,
};

function stopTimer() {
  clearInterval(timer.id);
  timer.id = null;
  el.timerBadge.hidden = true;
  el.timerBar.hidden = true;
  el.timerBadge.className = "timer-badge";
  el.timerBar.className = "timer-bar";
}

function startTimer() {
  if (state.index < 0) return;
  stopTimer();
  if (state.revealed) {
    state.revealed = false;
    render();
  }
  timer.remaining = prefs.timerSeconds;
  el.timerBadge.textContent = timer.remaining;
  el.timerBadge.hidden = false;
  el.timerBar.hidden = false;

  // Jump the bar back to full, then let each tick drain it one step.
  el.timerFill.style.transition = "none";
  el.timerFill.style.width = "100%";
  void el.timerFill.offsetWidth;
  el.timerFill.style.transition = "";
  drainTimerBar();

  sound.tick();
  timer.id = setInterval(tickTimer, 1000);
}

/** Slides the bar (over 1s) to where it should be when the next second ends. */
function drainTimerBar() {
  const next = Math.max(0, timer.remaining - 1);
  el.timerFill.style.width = `${(next / prefs.timerSeconds) * 100}%`;
}

function tickTimer() {
  timer.remaining--;
  drainTimerBar();
  const urgent = timer.remaining <= 3;
  el.timerBadge.classList.toggle("urgent", urgent && timer.remaining > 0);
  el.timerBar.classList.toggle("urgent", urgent);

  if (timer.remaining > 0) {
    el.timerBadge.textContent = timer.remaining;
    urgent ? sound.tickUrgent() : sound.tick();
    return;
  }

  clearInterval(timer.id);
  timer.id = null;
  el.timerBadge.textContent = "⏰";
  el.timerBadge.classList.add("done");
  sound.timesUp();
}

// ================================================================
// Actions
// ================================================================

function restart() {
  state.deck = shuffle(pool());
  state.history = state.deck.length ? [makeItem(state.deck.shift())] : [];
  state.index = state.history.length - 1;
  state.round = 1;
  state.revealed = false;
  save();
  showChallenge();
}

function next() {
  if (state.index < state.history.length - 1) {
    state.index++;
  } else {
    const item = draw();
    if (item === null) return;
    state.history.push(item);
    state.index++;
  }
  state.revealed = false;
  save();
  showChallenge();
}

function prev() {
  if (state.index <= 0) return;
  state.index--;
  state.revealed = false;
  save();
  showChallenge({ autoTimer: false });
}

function toggleAnswer() {
  if (state.index < 0) return;
  state.revealed = !state.revealed;
  stopTimer();
  render();
  if (state.revealed) celebrateAnswer();
}

function toggleSound() {
  prefs.sound = !prefs.sound;
  store(PREFS_KEY, prefs);
  renderSoundButton();
  showToast(prefs.sound ? "🔊 Sound on" : "🔇 Sound off");
}

function toggleFullscreen() {
  const doc = document;
  const root = doc.documentElement;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
  } else {
    (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root);
  }
}

// ================================================================
// Celebrations
// ================================================================

/** Restarts a CSS animation class on an element. */
function replay(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function showChallenge({ autoTimer = prefs.autoTimer } = {}) {
  stopTimer();
  render();
  if (state.index < 0) return;
  replay(el.equationBox, "pop");
  replay(el.heading, "pop");
  sound.pop();
  if (autoTimer) startTimer();
}

function celebrateAnswer() {
  el.cheer.textContent = pick(CHEERS);
  el.cheer.hidden = false;
  replay(el.cheer, "cheer");
  sound.tada();
  const box = el.equationBox.getBoundingClientRect();
  confetti.burst(box.left + box.width / 2, box.top + box.height * 0.2, { count: 90, spread: 60, power: 1.6 });
}

let bingoTimer;
function celebrateBingo() {
  stopTimer();
  el.bingoBurst.hidden = false;
  sound.fanfare();
  const fire = () => {
    confetti.burst(0, innerHeight, { count: 150, angle: 35, spread: 25, power: 2.6 });
    confetti.burst(innerWidth, innerHeight, { count: 150, angle: -35, spread: 25, power: 2.6 });
  };
  fire();
  clearTimeout(bingoTimer);
  bingoTimer = setTimeout(fire, 700);
}

function closeBingo() {
  el.bingoBurst.hidden = true;
  clearTimeout(bingoTimer);
}

// ================================================================
// Rendering
// ================================================================

const $ = (id) => document.getElementById(id);

const el = {
  heading: $("heading"),
  equationBox: $("equationBox"),
  equation: $("equation"),
  tagline: $("tagline"),
  strategy: $("strategy"),
  strategyKnow: $("strategyKnow"),
  strategyStep: $("strategyStep"),
  strategyBox: $("strategyBox"),
  cheer: $("cheer"),
  timerBadge: $("timerBadge"),
  timerBar: $("timerBar"),
  timerFill: $("timerFill"),
  status: $("status"),
  toast: $("toast"),
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  answerBtn: $("answerBtn"),
  timerBtn: $("timerBtn"),
  soundBtn: $("soundBtn"),
  bingoBurst: $("bingoBurst"),
  settingsOverlay: $("settingsOverlay"),
  confirmOverlay: $("confirmOverlay"),
  modeAll: $("modeAll"),
  modeBingo: $("modeBingo"),
  bingoSettings: $("bingoSettings"),
  answersInput: $("answersInput"),
  feedback: $("feedback"),
  settingsApply: $("settingsApply"),
  soundOpt: $("soundOpt"),
  timerSecondsOpt: $("timerSecondsOpt"),
  autoTimerOpt: $("autoTimerOpt"),
};

function render() {
  const c = itemChallenge(state.history[state.index]);
  el.cheer.hidden = !state.revealed;
  el.strategy.hidden = !(c && state.revealed);
  el.tagline.hidden = !el.strategy.hidden;

  if (!c) {
    el.heading.textContent = "Bingo Challenge";
    el.equation.innerHTML = '<div class="empty-msg">Add some Bingo answers in Settings (&#9881;) to begin.</div>';
    el.prevBtn.disabled = el.nextBtn.disabled = el.answerBtn.disabled = el.timerBtn.disabled = true;
    renderStatus();
    return;
  }

  el.heading.textContent = `Bingo Challenge ${state.index + 1}`;

  const result = state.revealed ? `<span class="answer">${c.answer}</span>` : "?";
  el.equation.innerHTML = `${c.a}<span class="op">+</span>${c.b}<span class="op">=</span>${result}`;

  // Strategy always starts from doubling the first number shown.
  if (c.isDouble) {
    el.strategyKnow.textContent = `${c.a} + ${c.a} is a double!`;
    el.strategyStep.hidden = true;
    el.strategyBox.textContent = `Double ${c.a} = ${c.answer}`;
  } else {
    const more = c.b > c.a;
    el.strategyKnow.textContent = `I know ${c.a} + ${c.a} = ${c.a * 2}`;
    el.strategyStep.textContent = `${c.b} is ONE ${more ? "more" : "less"} than ${c.a}`;
    el.strategyStep.hidden = false;
    el.strategyBox.textContent = `${c.a * 2} ${more ? "+" : "−"} 1 = ${c.answer}`;
  }

  el.answerBtn.textContent = state.revealed ? "Hide Answer" : "Show Answer";
  el.answerBtn.disabled = el.nextBtn.disabled = el.timerBtn.disabled = false;
  el.prevBtn.disabled = state.index <= 0;
  renderStatus();
}

function renderStatus() {
  const count = pool().length;
  const parts = [
    state.mode === "bingo" ? "Bingo Mode" : "All Questions",
    `${count} challenge${count === 1 ? "" : "s"}`,
  ];
  if (state.round > 1) parts.push(`Round ${state.round}`);
  el.status.textContent = parts.join(" · ");
}

function renderSoundButton() {
  el.soundBtn.innerHTML = prefs.sound ? "&#128266;" : "&#128263;";
  el.soundBtn.classList.toggle("is-off", !prefs.sound);
}

let toastTimer;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 3500);
}

// ================================================================
// Settings & confirmation dialogs
// ================================================================

const openOverlays = () => document.querySelectorAll(".overlay:not([hidden])");
const closeAllOverlays = () => openOverlays().forEach((o) => { o.hidden = true; });

function openSettings() {
  el.modeAll.checked = state.mode === "all";
  el.modeBingo.checked = state.mode === "bingo";
  el.answersInput.value = state.answers.join(", ");
  el.soundOpt.checked = prefs.sound;
  el.timerSecondsOpt.value = String(prefs.timerSeconds);
  el.autoTimerOpt.checked = prefs.autoTimer;
  updateSettings();
  el.settingsOverlay.hidden = false;
}

function updateSettings() {
  const bingo = el.modeBingo.checked;
  el.bingoSettings.classList.toggle("disabled", !bingo);

  if (!bingo) {
    el.feedback.innerHTML = "";
    el.settingsApply.disabled = false;
    return;
  }

  const { valid, invalid } = parseAnswers(el.answersInput.value);
  const messages = [];
  if (valid.length) {
    messages.push(`<span class="ok">${valid.length} challenge${valid.length === 1 ? "" : "s"} will be used.</span>`);
  } else {
    messages.push(`<span class="warn">Enter at least one answer between ${MIN_ANSWER} and ${MAX_ANSWER}.</span>`);
  }
  if (invalid.length) {
    messages.push(`<span class="warn">Ignored (no double or near double from 1–${MAX_ADDEND} makes these): ${invalid.join(", ")}.</span>`);
  }
  el.feedback.innerHTML = messages.join(" ");
  el.settingsApply.disabled = valid.length === 0;
}

function applySettings() {
  const { valid } = parseAnswers(el.answersInput.value);
  if (el.modeBingo.checked && valid.length === 0) return;
  state.mode = el.modeBingo.checked ? "bingo" : "all";
  state.answers = valid; // kept in All mode too, so switching back is easy
  el.settingsOverlay.hidden = true;
  restart();
}

function updateExtras() {
  prefs.sound = el.soundOpt.checked;
  prefs.timerSeconds = Number(el.timerSecondsOpt.value);
  prefs.autoTimer = el.autoTimerOpt.checked;
  store(PREFS_KEY, prefs);
  renderSoundButton();
}

function applyPreset(preset) {
  const matches = {
    all: () => true,
    even: (n) => n % 2 === 0,
    odd: (n) => n % 2 === 1,
    clear: () => false,
  }[preset];
  el.answersInput.value = allAnswers().filter(matches).join(", ");
  el.modeBingo.checked = true;
  updateSettings();
  if (preset === "clear") el.answersInput.focus();
}

// ================================================================
// Event wiring
// ================================================================

function onClick(id, handler) {
  $(id).addEventListener("click", (event) => {
    handler();
    // Drop focus so Space/Enter go to the shortcuts, not the last button.
    event.currentTarget.blur();
  });
}

onClick("nextBtn", next);
onClick("prevBtn", prev);
onClick("answerBtn", toggleAnswer);
onClick("timerBtn", startTimer);
onClick("bingoBtn", celebrateBingo);
onClick("soundBtn", toggleSound);
onClick("fullscreenBtn", toggleFullscreen);
onClick("settingsBtn", openSettings);
onClick("resetBtn", () => {
  el.confirmOverlay.hidden = false;
  $("confirmYes").focus();
});

$("confirmYes").addEventListener("click", () => {
  el.confirmOverlay.hidden = true;
  restart();
  showToast("Shuffled! Starting again from Bingo Challenge 1.");
});
$("confirmNo").addEventListener("click", () => { el.confirmOverlay.hidden = true; });
$("settingsCancel").addEventListener("click", () => { el.settingsOverlay.hidden = true; });
$("settingsApply").addEventListener("click", applySettings);
el.bingoBurst.addEventListener("click", closeBingo);

el.modeAll.addEventListener("change", updateSettings);
el.modeBingo.addEventListener("change", updateSettings);
el.answersInput.addEventListener("input", () => {
  el.modeBingo.checked = true;
  updateSettings();
});
[el.soundOpt, el.timerSecondsOpt, el.autoTimerOpt].forEach((input) => {
  input.addEventListener("change", updateExtras);
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

// Clicking the dimmed background closes a dialog.
document.querySelectorAll(".overlay").forEach((overlay) => {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.hidden = true;
  });
});

const SHORTCUTS = {
  ArrowRight: next,
  " ": next,
  ArrowLeft: prev,
  Enter: toggleAnswer,
  t: startTimer,
  b: celebrateBingo,
  m: toggleSound,
  f: toggleFullscreen,
};

document.addEventListener("keydown", (event) => {
  if (!el.bingoBurst.hidden) {
    event.preventDefault();
    closeBingo();
    return;
  }
  if (openOverlays().length) {
    if (event.key === "Escape") closeAllOverlays();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const action = SHORTCUTS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (action) {
    event.preventDefault();
    action();
  }
});

// ================================================================
// Start
// ================================================================

loadPrefs();
renderSoundButton();

if (load()) {
  showChallenge({ autoTimer: false });
} else {
  restart();
}
