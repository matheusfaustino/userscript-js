/**
 * Playback speed control for YouTube.
 *
 * Adds a small chip to the player's top-right corner: slower, the current rate,
 * faster. The center button toggles between 1x and the last non-1x rate. The
 * same actions work from the keyboard (`+`/`=`, `-`/`_`, `*`) and, with Shift
 * held, from the wheel while the pointer is over the player.
 *
 * The rate is persisted through GM storage and re-applied whenever YouTube
 * swaps or restarts media: a new `<video>` starts at 1x, and the player resets
 * playbackRate on its own when playback restarts.
 *
 * Ads are skipped entirely. YouTube puts `ad-showing` on the player while an ad
 * runs, and the chip is hidden so a stray click cannot change the ad's rate.
 * The class is watched so the content rate comes back when the ad ends.
 */

const { createStore } = require('../storage.js');

const PLAYER_SELECTOR = '#movie_player, #shorts-player, .html5-video-player';
/**
 * Most specific player first: a watch page can also carry a hover-preview
 * player, and the miniplayer keeps its own `#movie_player` around.
 */
const PLAYER_PRIORITY = ['#movie_player', '#shorts-player', '.html5-video-player'];
const CHIP_ID = 'usj-speed-control';
const STYLE_ID = 'usj-speed-control-style';
const VISIBLE_CLASS = 'usj-speed-control--visible';

const RATE_KEY = 'youtube-speed-control:rate';
const INVERT_KEY = 'youtube-speed-control:invert-wheel';
const FADE_KEY = 'youtube-speed-control:fade-on-hover';

const STEP = 0.25;
const MIN_RATE = 0;
const MAX_RATE = 16;
const DEFAULT_RATE = 1;

/** A rate YouTube itself applies (0.25 steps, 0.25-2x) must win over ours. */
const RATE_EPSILON = 0.001;

const rateStore = createStore(RATE_KEY, DEFAULT_RATE);
const invertStore = createStore(INVERT_KEY, false);
const fadeStore = createStore(FADE_KEY, true);

const STYLES = `
#${CHIP_ID} {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  padding: 3px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-family: Roboto, Arial, sans-serif;
  font-size: 13px;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  user-select: none;
  transition: opacity 140ms ease, background-color 140ms ease;
}
#${CHIP_ID}[hidden] { display: none; }
#${CHIP_ID}[data-fade="false"],
#${CHIP_ID}.${VISIBLE_CLASS},
#${CHIP_ID}:focus-within {
  opacity: 1;
  pointer-events: auto;
}
#${CHIP_ID}:hover { background: rgba(0, 0, 0, 0.8); }
#${CHIP_ID} button {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 24px;
  height: 24px;
  margin: 0;
  padding: 0 4px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
#${CHIP_ID} button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
#${CHIP_ID} button:disabled { opacity: 0.4; cursor: default; }
#${CHIP_ID} button:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 1px; }
#${CHIP_ID} [data-action="toggle"] {
  min-width: 48px;
  font-variant-numeric: tabular-nums;
}
.html5-video-player.ad-showing #${CHIP_ID} { display: none; }
@media (hover: none) {
  #${CHIP_ID} { opacity: 1; pointer-events: auto; }
}
`;

/** @type {HTMLElement | null} */
let player = null;
/** @type {HTMLVideoElement | null} */
let video = null;
/** @type {HTMLVideoElement | null} */
let boundVideo = null;
/** @type {HTMLElement | null} */
let chip = null;
/** @type {MutationObserver | null} */
let playerObserver = null;
/** @type {number} */
let refreshTimer = 0;
/** @type {number} */
let revealTimer = 0;
let pointerInPlayer = false;
let applying = false;

let rate = clampRate(rateStore.get(DEFAULT_RATE));
let lastRate = rate === DEFAULT_RATE ? DEFAULT_RATE : rate;

/**
 * Snap to the 0.25 grid and clamp to the supported range.
 *
 * @param {unknown} value
 * @returns {number}
 */
function clampRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_RATE;
  const stepped = Math.round(numeric / STEP) * STEP;
  return Number(Math.min(MAX_RATE, Math.max(MIN_RATE, stepped)).toFixed(2));
}

/** `1.25x`, `1x`: trailing zeros are noise on a 48px display. */
function formatRate(value) {
  return `${Number(value.toFixed(2))}x`;
}

function fadeEnabled() {
  return Boolean(fadeStore.get(true));
}

function adShowing() {
  return Boolean(player?.classList.contains('ad-showing'));
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  (document.head || document.documentElement).append(style);
}

function createButton(action, text, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', (event) => {
    // The player treats clicks on its surface as play/pause.
    event.preventDefault();
    event.stopPropagation();
    if (action === 'slower') changeRate(-STEP);
    else if (action === 'faster') changeRate(STEP);
    else toggleRate();
  });
  return button;
}

function buildChip() {
  const element = document.createElement('div');
  element.id = CHIP_ID;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Playback speed');
  element.append(
    createButton('slower', '\u2212', 'Slower'),
    createButton('toggle', formatRate(rate), 'Playback speed'),
    createButton('faster', '+', 'Faster'),
  );
  return element;
}

function mountChip() {
  if (!player || !video) return;
  ensureStyles();
  if (!chip) chip = buildChip();
  if (chip.parentElement !== player) player.append(chip);
}

function teardownChip() {
  window.clearTimeout(revealTimer);
  revealTimer = 0;
  chip?.remove();
  chip = null;
}

function updateChip() {
  if (!chip) return;
  chip.hidden = adShowing();
  chip.dataset.fade = fadeEnabled() ? 'true' : 'false';

  const display = chip.querySelector('[data-action="toggle"]');
  const slower = chip.querySelector('[data-action="slower"]');
  const faster = chip.querySelector('[data-action="faster"]');

  if (display) {
    display.textContent = formatRate(rate);
    // Name the action, not just the value: the visible text is only "1.25x".
    display.setAttribute(
      'aria-label',
      rate === DEFAULT_RATE
        ? `Playback speed ${formatRate(rate)}. Restore ${formatRate(lastRate)}.`
        : `Playback speed ${formatRate(rate)}. Reset to 1x.`,
    );
    display.title =
      rate === DEFAULT_RATE ? `Restore ${formatRate(lastRate)}` : 'Reset to 1x';
  }
  if (slower) slower.disabled = rate <= MIN_RATE;
  if (faster) faster.disabled = rate >= MAX_RATE;
}

/** Show the chip briefly after a keyboard or wheel change, then fade again. */
function reveal() {
  if (!chip || !fadeEnabled()) return;
  chip.classList.add(VISIBLE_CLASS);
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => {
    revealTimer = 0;
    if (!pointerInPlayer) chip?.classList.remove(VISIBLE_CLASS);
  }, 1200);
}

function applyRate() {
  if (!video || adShowing()) return;
  if (Math.abs(video.playbackRate - rate) < RATE_EPSILON) return;
  applying = true;
  try {
    video.playbackRate = rate;
  } catch (error) {
    // Managers and browsers disagree on out-of-range handling; the chip keeps
    // the requested value so the user can step back into a supported rate.
  } finally {
    applying = false;
  }
}

function setRate(value) {
  const next = clampRate(value);
  const changed = next !== rate;
  rate = next;
  if (next !== DEFAULT_RATE) lastRate = next;
  rateStore.set(rate);
  if (changed) applyRate();
  updateChip();
  reveal();
}

function changeRate(delta) {
  setRate(rate + delta);
}

/** Center click and the reset key restore the last non-1x rate at 1x. */
function toggleRate() {
  setRate(rate === DEFAULT_RATE ? lastRate : DEFAULT_RATE);
}

function onPlaybackStart() {
  applyRate();
  updateChip();
}

/**
 * Adopt a rate chosen outside the chip (YouTube's own speed menu). Without
 * this the next play would overwrite the user's choice and the chip would lie.
 *
 * The value is taken as-is rather than snapped to our 0.25 grid: YouTube's menu
 * stays on the grid today, but another extension may not, and forcing it back
 * would make the chip fight the video.
 */
function onRateChange() {
  if (applying || !video || adShowing()) return;
  if (video !== boundVideo) return;
  // A new media resource resets playbackRate before it has metadata; that is
  // the reset our own play handler is about to undo, not a user choice.
  if (video.readyState === 0) return;
  const next = Number(video.playbackRate);
  if (!Number.isFinite(next) || next < MIN_RATE || next > MAX_RATE) return;
  const actual = Number(next.toFixed(2));
  if (Math.abs(actual - rate) < RATE_EPSILON) return;
  rate = actual;
  if (actual !== DEFAULT_RATE) lastRate = actual;
  rateStore.set(rate);
  updateChip();
}

function unbindVideo() {
  if (!boundVideo) return;
  boundVideo.removeEventListener('play', onPlaybackStart);
  boundVideo.removeEventListener('playing', onPlaybackStart);
  boundVideo.removeEventListener('loadedmetadata', onPlaybackStart);
  boundVideo.removeEventListener('ratechange', onRateChange);
  boundVideo = null;
}

function bindVideo() {
  video = player?.querySelector('video') ?? null;
  if (!video) {
    unbindVideo();
    return;
  }
  if (video === boundVideo) return;
  unbindVideo();
  boundVideo = video;
  boundVideo.addEventListener('play', onPlaybackStart);
  boundVideo.addEventListener('playing', onPlaybackStart);
  boundVideo.addEventListener('loadedmetadata', onPlaybackStart);
  boundVideo.addEventListener('ratechange', onRateChange);
}

/** Prefer the visible player: a watch page and the miniplayer can coexist. */
function findPlayer() {
  let fallback = null;
  for (const selector of PLAYER_PRIORITY) {
    const candidates = [...document.querySelectorAll(selector)];
    const withVideo = candidates.filter((element) => element.querySelector('video'));
    const visible = withVideo.find((element) => element.getBoundingClientRect().width > 0);
    if (visible) return visible;
    fallback ??= withVideo[0] ?? null;
  }
  return fallback;
}

function observePlayer() {
  playerObserver?.disconnect();
  playerObserver = null;
  if (!player) return;
  playerObserver = new MutationObserver(() => {
    updateChip();
    if (!adShowing()) {
      bindVideo();
      applyRate();
    }
  });
  playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
}

function teardown() {
  teardownChip();
  unbindVideo();
  playerObserver?.disconnect();
  playerObserver = null;
  player = null;
  video = null;
}

function refresh() {
  const nextPlayer = findPlayer();
  if (!nextPlayer) {
    teardown();
    return;
  }

  const changed = nextPlayer !== player;
  player = nextPlayer;
  if (changed) {
    teardownChip();
    observePlayer();
  }

  bindVideo();
  if (!video) {
    teardownChip();
    return;
  }

  mountChip();
  applyRate();
  updateChip();
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = 0;
    refresh();
  }, 100);
}

const pointer = { clientX: 0, clientY: 0 };

function pointerInsidePlayer() {
  if (!player) return false;
  const rect = player.getBoundingClientRect();
  const { clientX, clientY } = pointer;
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function isTyping(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!player || !video || isTyping(event.target)) return;

  const { key } = event;
  if (key === '+' || key === '=') changeRate(STEP);
  else if (key === '-' || key === '_') changeRate(-STEP);
  // Numpad multiply reports key "*" in browsers that map it; both name the
  // same reset the original extension bound.
  else if (key === '*' || event.code === 'NumpadMultiply') setRate(DEFAULT_RATE);
  else return;

  event.preventDefault();
  event.stopPropagation();
}

function onPointerMove(event) {
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;
  if (!chip || !player) return;
  pointerInPlayer = pointerInsidePlayer() || chip.contains(event.target);
  if (!fadeEnabled()) return;
  chip.classList.toggle(VISIBLE_CLASS, pointerInPlayer);
  if (pointerInPlayer) {
    window.clearTimeout(revealTimer);
    revealTimer = 0;
  }
}

function onWheel(event) {
  if (!event.shiftKey || !player || !video || event.deltaY === 0) return;
  // Scoped to the player: shift+wheel elsewhere on the page is horizontal
  // scrolling, which the control has no business taking over.
  if (!pointerInsidePlayer()) return;

  event.preventDefault();
  const invert = Boolean(invertStore.get(false));
  const faster = invert ? event.deltaY > 0 : event.deltaY < 0;
  changeRate(faster ? STEP : -STEP);
}

function onFullscreenChange() {
  // The chip lives inside the player, so it follows fullscreen on its own; the
  // hover rect has to be re-read after the layout change.
  pointerInPlayer = false;
  chip?.classList.remove(VISIBLE_CLASS);
}

function registerMenuCommands() {
  if (typeof GM_registerMenuCommand !== 'function') return; // eslint-disable-line no-undef
  GM_registerMenuCommand('Speed control: toggle shift+wheel direction', () => { // eslint-disable-line no-undef
    invertStore.set(!invertStore.get(false));
  });
  GM_registerMenuCommand('Speed control: toggle fade on player hover', () => { // eslint-disable-line no-undef
    fadeStore.set(!fadeStore.get(true));
    updateChip();
  });
  GM_registerMenuCommand('Speed control: reset saved speed to 1x', () => { // eslint-disable-line no-undef
    setRate(DEFAULT_RATE);
  });
}

refresh();
registerMenuCommands();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
}

// YouTube replaces the player's own addEventListener, so page-level listeners
// and a document observer are the reliable paths (as in the other YouTube
// scripts here). The observer is debounced: the feed mutates continuously.
const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (
        node.matches?.(PLAYER_SELECTOR) ||
        node.matches?.('video') ||
        node.querySelector?.(PLAYER_SELECTOR) ||
        node.querySelector?.('video')
      ) {
        scheduleRefresh();
        return;
      }
    }
  }
});

const root = document.documentElement;
if (root) observer.observe(root, { childList: true, subtree: true });
else document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });

document.addEventListener('yt-navigate-finish', refresh);
document.addEventListener('yt-page-data-updated', refresh);
document.addEventListener('loadedmetadata', scheduleRefresh, true);
document.addEventListener('mousemove', onPointerMove);
document.addEventListener('keydown', onKeyDown, true);
document.addEventListener('wheel', onWheel, { capture: true, passive: false });
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);
