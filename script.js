"use strict";

// ================================================================
// Maths
// ----------------------------------------------------------------
// Every double n + n (answers 2..40, even) and near double
// n + (n + 1) (answers 3..39, odd) has a unique answer, so the answer
// alone identifies a challenge. Near doubles are always shown with
// the smaller number first (8 + 9, never 9 + 8).
// ================================================================

const MAX_ADDEND = 20;
const MIN_ANSWER = 2;
const MAX_ANSWER = MAX_ADDEND * 2;
const STORAGE_KEY = "bingoDoublesState.v2";

function challengeFor(answer) {
  if (!Number.isInteger(answer) || answer < MIN_ANSWER || answer > MAX_ANSWER) return null;
  const a = Math.floor(answer / 2);
  const b = answer - a;
  return { a, b, answer, isDouble: a === b };
}

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
// State
// ================================================================

const state = {
  mode: "all",   // "all" | "bingo"
  answers: [],   // Bingo card answers (used in Bingo mode)
  history: [],   // answers of challenges shown so far, in order
  index: -1,     // position in history currently on screen
  deck: [],      // answers still to draw this round
  round: 1,
  revealed: false,
};

function pool() {
  return state.mode === "bingo" ? state.answers.slice() : allAnswers();
}

function save() {
  const { revealed, ...saved } = state;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (e) { /* storage unavailable */ }
}

/** Restores the last session; returns false if there is nothing valid to restore. */
function load() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return false; }
  if (!saved || !Array.isArray(saved.history) || !Array.isArray(saved.deck)) return false;

  // Re-validate so a bad stored value can never reach the screen.
  const isValid = (n) => challengeFor(n) !== null;
  if (saved.history.length === 0 || !saved.history.every(isValid)) return false;

  state.answers = (saved.answers || []).filter(isValid);
  state.mode = saved.mode === "bingo" && state.answers.length ? "bingo" : "all";
  state.history = saved.history;
  state.index = Math.min(Math.max(0, saved.index | 0), saved.history.length - 1);
  state.deck = saved.deck.filter(isValid);
  state.round = saved.round || 1;
  return true;
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
    if (state.deck.length > 1 && state.deck[0] === last) {
      [state.deck[0], state.deck[1]] = [state.deck[1], state.deck[0]];
    }
    showToast(`All ${answers.length} challenges used — shuffled for a new round!`);
  }
  return state.deck.shift();
}

// ================================================================
// Actions
// ================================================================

function restart() {
  state.deck = shuffle(pool());
  state.history = state.deck.length ? [state.deck.shift()] : [];
  state.index = state.history.length - 1;
  state.round = 1;
  state.revealed = false;
  save();
  render();
}

function next() {
  if (state.index < state.history.length - 1) {
    state.index++;
  } else {
    const answer = draw();
    if (answer === null) return;
    state.history.push(answer);
    state.index++;
  }
  state.revealed = false;
  save();
  render();
}

function prev() {
  if (state.index <= 0) return;
  state.index--;
  state.revealed = false;
  save();
  render();
}

function toggleAnswer() {
  if (state.index < 0) return;
  state.revealed = !state.revealed;
  render();
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
// Rendering
// ================================================================

const $ = (id) => document.getElementById(id);

const el = {
  heading: $("heading"),
  equation: $("equation"),
  strategy: $("strategy"),
  status: $("status"),
  toast: $("toast"),
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  answerBtn: $("answerBtn"),
  settingsOverlay: $("settingsOverlay"),
  confirmOverlay: $("confirmOverlay"),
  modeAll: $("modeAll"),
  modeBingo: $("modeBingo"),
  bingoSettings: $("bingoSettings"),
  answersInput: $("answersInput"),
  feedback: $("feedback"),
  settingsApply: $("settingsApply"),
};

function render() {
  const c = challengeFor(state.history[state.index]);

  if (!c) {
    el.heading.textContent = "Bingo Challenge";
    el.equation.innerHTML = '<div class="empty-msg">Add some Bingo answers in Settings (&#9881;) to begin.</div>';
    el.strategy.textContent = "";
    el.prevBtn.disabled = el.nextBtn.disabled = el.answerBtn.disabled = true;
    renderStatus();
    return;
  }

  el.heading.textContent = `Bingo Challenge ${state.index + 1}`;

  const result = state.revealed ? `<span class="answer">${c.answer}</span>` : "?";
  el.equation.innerHTML = `${c.a}<span class="op">+</span>${c.b}<span class="op">=</span>${result}`;

  if (!state.revealed) {
    el.strategy.textContent = "";
  } else if (c.isDouble) {
    el.strategy.textContent = `Double ${c.a} is ${c.answer}!`;
  } else {
    el.strategy.textContent = `I know ${c.a} + ${c.a} = ${c.a * 2}, so ${c.a} + ${c.b} = ${c.answer}!`;
  }

  el.answerBtn.textContent = state.revealed ? "Hide Answer" : "Show Answer";
  el.answerBtn.disabled = el.nextBtn.disabled = false;
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

el.modeAll.addEventListener("change", updateSettings);
el.modeBingo.addEventListener("change", updateSettings);
el.answersInput.addEventListener("input", () => {
  el.modeBingo.checked = true;
  updateSettings();
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
  f: toggleFullscreen,
  F: toggleFullscreen,
};

document.addEventListener("keydown", (event) => {
  if (openOverlays().length) {
    if (event.key === "Escape") closeAllOverlays();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const action = SHORTCUTS[event.key];
  if (action) {
    event.preventDefault();
    action();
  }
});

// ================================================================
// Start
// ================================================================

if (load()) {
  render();
} else {
  restart();
}
