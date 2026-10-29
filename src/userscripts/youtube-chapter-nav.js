/**
 * Chapter navigation for YouTube watch pages.
 *
 * Adds a previous/next button to the left and right edges of the player. They
 * appear on hover and seek to the adjacent chapter. At the boundaries the user
 * still gets a useful action instead of a dead button: previous replays the
 * first chapter, next jumps to the end of the video.
 *
 * Chapter data is read from `ytd-app`'s page data, which YouTube refreshes on
 * SPA navigation. The player response on live pages does not carry the chapter
 * overlays, and `ytInitialData` keeps the data from the first full load, so it
 * is only a fallback for the initial paint.
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
  width: 56px;
  height: 88px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #fff;
  font: 40px/1 system-ui, sans-serif;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
  cursor: pointer;
  pointer-events: auto;
  opacity: 0.85;
}
#${NAV_ID} button:hover {
  background: rgba(255, 255, 255, 0.15);
  opacity: 1;
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
 * Read chapters from a page data or player response object.
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

/** Page data YouTube refreshes on SPA navigation. */
function appData() {
  try {
    return document.querySelector('ytd-app')?.data?.response ?? null;
  } catch (error) {
    return null;
  }
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
  for (const source of [appData(), playerData(), window.ytInitialData]) {
    const found = readChapters(source);
    if (found.length > 0) return found;
  }
  return [];
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
  nav.append(addButton('prev', '<', 'Previous chapter'), addButton('next', '>', 'Next chapter'));
  player.append(nav);
}

function button(direction) {
  return nav?.querySelector(`[data-direction="${direction}"]`) ?? null;
}

function label(text, title) {
  return title ? `${text}: ${title}` : text;
}

/**
 * Reflect the chapter list and playhead onto the two buttons.
 *
 * Titles name the target, and the boundary actions are named for what they do
 * (replay, skip to the end) so the buttons never look broken.
 */
function update() {
  if (!nav) return;

  nav.hidden = chapters.length === 0;
  const prev = button('prev');
  const next = button('next');
  if (!prev || !next) return;

  if (chapters.length === 0) {
    prev.disabled = true;
    next.disabled = true;
    prev.title = 'No chapters in this video';
    next.title = 'No chapters in this video';
    return;
  }

  const video = player?.querySelector('video');
  const index = video ? chapterIndex(video.currentTime) : -1;
  const previous = index > 0 ? chapters[index - 1] : null;
  const following = index === -1 ? chapters[0] : chapters[index + 1] ?? null;

  prev.disabled = false;
  next.disabled = false;
  prev.title =
    index > 0
      ? label('Previous chapter', previous.title)
      : index === 0
        ? label('Replay chapter', chapters[0].title)
        : 'Restart video';
  next.title = following ? label('Next chapter', following.title) : 'Skip to the end';
}

function seek(video, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  video.currentTime = seconds;
}

/**
 * Seek to the adjacent chapter, or the boundary action when there is none.
 * Chapter data is re-read first so a stale cache cannot skip one.
 */
function step(direction) {
  const video = player?.querySelector('video');
  if (!video) return;

  chapters = currentChapters();
  if (chapters.length === 0) {
    update();
    return;
  }

  const index = chapterIndex(video.currentTime);

  if (direction > 0) {
    if (index === -1) seek(video, chapters[0].start);
    else if (index < chapters.length - 1) seek(video, chapters[index + 1].start);
    else seek(video, video.duration);
  } else if (index > 0) {
    seek(video, chapters[index - 1].start);
  } else if (index === 0) {
    seek(video, chapters[0].start);
  } else {
    seek(video, 0);
  }

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

// Hover is tracked from the document by pointer position: YouTube replaces
// addEventListener on the player element (listeners registered there never see
// mouseenter) and re-renders overlays under the cursor, so element-bound hover
// events are unreliable.
document.addEventListener('mousemove', (event) => {
  if (!nav || !player) return;
  const rect = player.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  nav.classList.toggle(VISIBLE_CLASS, inside);
});

document.addEventListener('yt-navigate-finish', refresh);
document.addEventListener('yt-page-data-updated', refresh);
document.addEventListener('loadedmetadata', refresh, true);
document.addEventListener('timeupdate', update, true);
