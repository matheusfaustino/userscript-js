/**
 * Chapter navigation for YouTube watch pages.
 *
 * Adds a previous/next button to the left and right edges of the player. They
 * appear on hover, seek to the start of the adjacent chapter, and disable when
 * there is nothing to jump to. The buttons are deliberately thin: chapter
 * changes and seeking stay YouTube's job, this only picks the target time.
 *
 * Chapter data comes from the player response, which is per-video and survives
 * SPA navigation. `ytInitialData` is the fallback for the first paint, before
 * the player has a response.
 */

const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const NAV_ID = 'usj-chapter-nav';
const VISIBLE_CLASS = 'usj-chapter-nav--visible';
const STYLE_ID = 'usj-chapter-nav-style';

const STYLES = `
#${NAV_ID} {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 60;
  opacity: 0;
  transition: opacity 120ms ease;
}
#${NAV_ID}.${VISIBLE_CLASS},
#${NAV_ID}:focus-within {
  opacity: 1;
}
@media (hover: none) {
  #${NAV_ID} { opacity: 1; }
}
#${NAV_ID} button {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 52px;
  height: 84px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font: 34px/1 system-ui, sans-serif;
  cursor: pointer;
  pointer-events: auto;
}
#${NAV_ID} button:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.82);
}
#${NAV_ID} button:disabled {
  opacity: 0.25;
  cursor: default;
}
#${NAV_ID} [data-direction="prev"] { left: 12px; }
#${NAV_ID} [data-direction="next"] { right: 12px; }
`;

/** Marker keys YouTube uses for authored and auto-generated chapters. */
const MARKER_KEYS = ['DESCRIPTION_CHAPTERS', 'AUTO_CHAPTERS'];

/** @type {HTMLElement | null} */
let player = null;
/** @type {HTMLElement | null} */
let nav = null;
/** Player element whose hover listeners are already installed. */
let boundPlayer = null;
/** @type {{ start: number, title: string }[]} */
let chapters = [];

function textOf(value) {
  if (!value) return '';
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || '').join('');
  return '';
}

function markersFrom(source) {
  return (
    source?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer
      ?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap ??
    source?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.playerBar
      ?.multiMarkersPlayerBarRenderer?.markersMap ??
    null
  );
}

/**
 * Read chapters from a player response or `ytInitialData` object.
 *
 * Chapters arrive as millisecond offsets under a `markersMap` entry whose value
 * carries a `chapters` array; every other marker (heatmap, sponsor segments)
 * has to be skipped.
 *
 * @param {unknown} source
 * @returns {{ start: number, title: string }[]}
 */
function readChapters(source) {
  const markersMap = markersFrom(source);
  if (!Array.isArray(markersMap)) return [];

  const rank = (marker) => {
    const position = MARKER_KEYS.indexOf(marker?.key);
    return position === -1 ? MARKER_KEYS.length : position;
  };

  const ordered = [...markersMap].sort((left, right) => rank(left) - rank(right));

  for (const marker of ordered) {
    const entries = marker?.value?.chapters;
    if (!Array.isArray(entries)) continue;

    const parsed = entries
      .map((entry) => entry?.chapterRenderer)
      .filter(Boolean)
      .map((renderer) => ({
        start: Number(renderer.timeRangeStartMillis) / 1000,
        title: textOf(renderer.title),
      }))
      .filter((chapter) => Number.isFinite(chapter.start));

    if (parsed.length > 0) {
      return parsed.sort((left, right) => left.start - right.start);
    }
  }

  return [];
}

function playerData() {
  if (!player) return null;
  try {
    return typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
  } catch (error) {
    return null;
  }
}

function currentChapters() {
  const fromPlayer = readChapters(playerData());
  return fromPlayer.length > 0 ? fromPlayer : readChapters(window.ytInitialData);
}

function chapterIndex(time) {
  let index = -1;
  for (let position = 0; position < chapters.length; position += 1) {
    if (chapters[position].start <= time + 0.25) index = position;
  }
  return index;
}

function addButton(direction, glyph, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.direction = direction;
  button.textContent = glyph;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', () => step(direction === 'next' ? 1 : -1));
  return button;
}

function mount() {
  if (!player) return;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    (document.head || document.documentElement).append(style);
  }

  if (nav && nav.isConnected) return;

  nav = document.createElement('div');
  nav.id = NAV_ID;
  nav.append(addButton('prev', '‹', 'Previous chapter'), addButton('next', '›', 'Next chapter'));
  player.append(nav);

  if (boundPlayer !== player) {
    boundPlayer = player;
    player.addEventListener('mouseenter', () => nav.classList.add(VISIBLE_CLASS));
    player.addEventListener('mouseleave', () => nav.classList.remove(VISIBLE_CLASS));
  }
}

function button(direction) {
  return nav?.querySelector(`[data-direction="${direction}"]`) ?? null;
}

/**
 * Reflect the chapter list and playhead onto the two buttons.
 *
 * Titles name the chapter the button leads to, so the button explains itself
 * before it is clicked.
 */
function update() {
  if (!nav) return;

  const video = player?.querySelector('video');
  const index = video ? chapterIndex(video.currentTime) : -1;
  const prev = button('prev');
  const next = button('next');

  if (chapters.length === 0) {
    prev.disabled = true;
    next.disabled = true;
    prev.title = 'No chapters in this video';
    next.title = 'No chapters in this video';
    return;
  }

  const previous = index > 0 ? chapters[index - 1] : null;
  const following = index === -1 ? chapters[0] : chapters[index + 1] ?? null;

  prev.disabled = !previous;
  next.disabled = !following;
  prev.title = previous ? `Previous chapter: ${previous.title}` : 'No previous chapter';
  next.title = following ? `Next chapter: ${following.title}` : 'No next chapter';
}

/** Seek to the adjacent chapter, re-reading chapter data so a stale cache cannot skip one. */
function step(direction) {
  const video = player?.querySelector('video');
  if (!video) return;

  chapters = currentChapters();
  const index = chapterIndex(video.currentTime);
  const target =
    direction > 0
      ? index === -1
        ? chapters[0]
        : chapters[index + 1]
      : index > 0
        ? chapters[index - 1]
        : null;

  if (!target) {
    update();
    return;
  }

  video.currentTime = target.start;
  update();
}

function refresh() {
  const nextPlayer = document.querySelector(PLAYER_SELECTOR);
  if (!nextPlayer) return;

  if (nextPlayer !== player) {
    player = nextPlayer;
    nav = null;
  }

  mount();

  chapters = currentChapters();
  update();
}

refresh();

document.addEventListener('yt-navigate-finish', refresh);
document.addEventListener('yt-page-data-updated', refresh);
document.addEventListener('loadedmetadata', refresh, true);
document.addEventListener('timeupdate', update, true);
