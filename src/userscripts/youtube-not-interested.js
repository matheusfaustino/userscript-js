/**
 * "Not interested" shortcut for YouTube video cards.
 *
 * Adds a circular "block" button (YouTube's own Not interested icon) to the
 * top-left corner of every video thumbnail on the home feed and the watch-page
 * sidebar. Clicking it opens the card's own three-dot menu and activates the
 * real "Not interested" item, so YouTube runs the same feedback request a
 * manual click would run.
 *
 * Menu items are identified by icon, not by label. YouTube localizes the text,
 * so an English-only match would silently do nothing in other locales. The
 * order is: `iconType` from the item's data, then the rendered icon path, then
 * a short list of known translations as a last resort.
 *
 * No GM APIs are used and nothing outside the DOM is read, so the script works
 * whether the manager runs it in page context or a content-script sandbox.
 *
 * Selectors cover both the classic renderers (ytd-rich-item-renderer,
 * ytd-menu-renderer) and the current desktop build (yt-lockup-view-model,
 * yt-thumbnail-view-model, button-view-model sheet menus), verified against
 * live youtube.com in Nov 2026.
 * The icon path is verified against the desktop bundle, where
 * `NOT_INTERESTED` maps to `circle_slash` / `slash_circle_left` (newer sheet
 * menus use the `HIDE` image name for the same action).
 */

const BUTTON_CLASS = 'usj-ni-button';
const HOST_CLASS = 'usj-ni-host';
const STYLE_ID = 'usj-ni-style';
const MENU_TIMEOUT_MS = 1000;

/**
 * Card wrappers that hold a single video. Shorts are filtered later by their
 * link and playlists/channels by their wrapper, since YouTube reuses the rich
 * item wrapper for all of them.
 */
const CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  // Newer surfaces (search, some feeds) render the video as a standalone
  // lockup instead of a classic renderer. Non-video lockups are filtered by
  // isVideoCard, and the descendant-button guard in attach() keeps nested
  // lockups from producing a second button.
  'yt-lockup-view-model',
].join(', ');

const THUMBNAIL_SELECTOR = [
  'ytd-thumbnail',
  'a#thumbnail',
  '#thumbnail',
  '.yt-lockup-view-model__content-image',
  // Current desktop build (Nov 2026): no ytd-thumbnail. The image lives in
  // `a.ytLockupViewModelContentImage > yt-thumbnail-view-model`.
  'yt-thumbnail-view-model',
  'a.ytLockupViewModelContentImage',
  '.ytLockupViewModelContentImage',
].join(', ');

/** Cards YouTube fills with something other than a single video. */
const EXCLUDED_SELECTOR = [
  'ytd-ad-slot-renderer',
  'ytd-promoted-video-renderer',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-display-ad-renderer',
  '#ad-badge',
  'ytm-shorts-lockup-view-model',
  'ytd-reel-item-renderer',
  'ytd-reel-shelf-renderer',
  'ytd-channel-renderer',
  'ytd-playlist-renderer',
  'ytd-grid-playlist-renderer',
  'ytd-rich-grid-playlist-renderer',
  'ytd-radio-renderer',
  // Current build renders playlists/mixes/podcasts as lockups with a
  // collection thumbnail stack instead of a dedicated renderer.
  'yt-collection-thumbnail-view-model',
  'yt-collections-stack',
  '.ytCollectionsStackHost',
].join(', ');

const POPUP_SELECTOR = [
  'ytd-menu-popup-renderer',
  // Current build opens the card menu as a sheet, not a menu popup.
  'yt-sheet-view-model',
  'ytd-popup-container',
  'tp-yt-paper-dialog',
].join(', ');
const ITEM_SELECTOR = [
  'ytd-menu-service-item-renderer',
  'ytd-menu-navigation-item-renderer',
  'yt-list-item-view-model',
  'ytd-menu-popup-renderer > tp-yt-paper-item',
].join(', ');

/**
 * YouTube's "Not interested" glyph.
 *
 * Taken from the live `desktop_polymer` icon sprite: the menu's
 * `NOT_INTERESTED` iconType maps to `circle_slash` / `slash_circle_left`, whose
 * path is the Material "block" glyph (circle with a diagonal slash).
 */
const ICON_PATH =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 ' +
  '3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 ' +
  '0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z';

/**
 * Minus/slash-circle variants YouTube has shipped. Compared after removing
 * whitespace and commas, since minification rewrites the spacing.
 */
const NOT_INTERESTED_PATHS = new Set(
  [
    ICON_PATH,
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM7 11h10v2H7z',
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z',
    'M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  ].map(compactPath),
);

/**
 * Last-resort labels. The icon checks above cover every locale; this list only
 * exists for surfaces that render the item without data or an SVG icon.
 */
const TEXT_FALLBACKS = [
  'not interested',
  'nicht interessiert',
  'kein interesse',
  'no me interesa',
  'nao tenho interesse',
  'nao estou interessado',
  "ca ne m'interesse pas",
  'non mi interessa',
  'niet geinteresseerd',
  'nie interesuje mnie',
  'nie jestem zainteresowany',
  'ilgilenmiyorum',
  'не интересует',
  'не цікавить',
  '興味がありません',
  '관심 없음',
  'इसमें मेरी रुचि नहीं है',
  'tidak tertarik',
  'khong quan tam',
  'ไม่สนใจ',
  'غير مهتم',
  'nem érdekel',
  'nemam zajem',
  'ei kiinnosta',
  'inte intresserad',
  'ikke interesseret',
  'ikke interessert',
].map(normalizeText);

const STYLES = `
.${HOST_CLASS} {
  position: relative;
}
.${BUTTON_CLASS} {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  pointer-events: auto;
  transition: opacity 120ms ease, background-color 120ms ease;
}
.${HOST_CLASS}:hover .${BUTTON_CLASS},
.${HOST_CLASS}:focus-within .${BUTTON_CLASS},
.${BUTTON_CLASS}:focus-visible {
  opacity: 1;
}
.${BUTTON_CLASS}:hover {
  background: rgba(0, 0, 0, 0.9);
}
.${BUTTON_CLASS}:focus-visible {
  outline: 2px solid #3ea6ff;
  outline-offset: 2px;
}
.${BUTTON_CLASS} svg {
  display: block;
  width: 24px;
  height: 24px;
  fill: currentColor;
  pointer-events: none;
}
@media (hover: none) {
  .${BUTTON_CLASS} { opacity: 1; }
}
`;

let busy = false;
let scanTimer = 0;

function compactPath(value) {
  return String(value).replace(/[\s,]+/g, '');
}

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function dataOf(element) {
  try {
    return element.data ?? null;
  } catch (error) {
    return null;
  }
}

/** @param {Element} card */
function thumbnailIn(card) {
  return card.querySelector(THUMBNAIL_SELECTOR);
}

function isYoutubeWatchLink(anchor) {
  let url;
  try {
    url = new URL(anchor.getAttribute('href') ?? '', window.location.href);
  } catch (error) {
    return false;
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return false;
  if (!url.pathname.startsWith('/watch') || url.searchParams.get('v') === null) return false;
  // Mixes, playlists, and podcast episodes link to a watch page too, but with
  // a list param. Those cards are collections, not single videos.
  if (url.searchParams.has('list')) return false;
  return true;
}

/** The card must link to a watch page: channels, playlists, and Shorts do not. */
function isVideoCard(card) {
  if (card.querySelector(EXCLUDED_SELECTOR)) return false;
  for (const anchor of card.querySelectorAll('a[href]')) {
    if (isYoutubeWatchLink(anchor)) return true;
  }
  return false;
}

/** The card's own three-dot menu; absent until YouTube finishes rendering it. */
function cardMenu(card) {
  for (const renderer of card.querySelectorAll('ytd-menu-renderer')) {
    const target = renderer.querySelector('#button, yt-icon-button, button');
    if (target) return target;
  }
  // Current build: `yt-lockup-metadata-view-model ... > button-view-model > button`.
  const modern = card.querySelector(
    'button-view-model button, .ytLockupMetadataViewModelMenuButton button, yt-lockup-metadata-view-model button',
  );
  if (modern) return modern;
  return card.querySelector('#menu #button, #menu yt-icon-button, #menu button, #button');
}

function createButton(card) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.title = 'Not interested';
  button.setAttribute('aria-label', 'Not interested');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', ICON_PATH);
  svg.append(shape);
  button.append(svg);

  // The button sits above the thumbnail link; both handlers keep the click from
  // reaching it, so the page never navigates to the video.
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    notInterested(card);
  });
  button.addEventListener('auxclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  return button;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  (document.head || document.documentElement).append(style);
}

function attach(card) {
  if (card.querySelector(`.${BUTTON_CLASS}`)) return;
  if (!isVideoCard(card)) return;
  const thumbnail = thumbnailIn(card);
  if (!thumbnail) return;
  if (!cardMenu(card)) return;

  ensureStyles();
  // Hosting the button on the thumbnail (not the card) keeps it inside the
  // image bounds and makes the hover reveal cover only the thumbnail.
  thumbnail.classList.add(HOST_CLASS);
  thumbnail.append(createButton(card));
}

function attachAll(root = document) {
  for (const card of root.querySelectorAll(CARD_SELECTOR)) {
    const existing = card.querySelector(`.${BUTTON_CLASS}`);
    // A virtualized card can be reused for a Short or ad; drop the button then.
    if (existing && !isVideoCard(card)) {
      existing.remove();
      continue;
    }
    attach(card);
  }
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    attachAll();
  }, 100);
}

function press(element) {
  // yt-icon-button keeps its native button in a shadow root; clicking the host
  // alone does not always activate it.
  const target = element.shadowRoot?.querySelector('button') ?? element;
  if (typeof target.click === 'function') target.click();
}

function clickableWithin(item) {
  return item.querySelector('tp-yt-paper-item, button, a[href], [role="menuitem"]') ?? item;
}

function isVisible(element) {
  // checkVisibility also catches an ancestor with opacity/visibility set, which
  // is how the closed menu dropdown is kept in the DOM on some builds.
  if (
    typeof element.checkVisibility === 'function' &&
    !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  ) {
    return false;
  }
  if (element.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Visible menu items for the menu that was just opened.
 *
 * Scoping to the card's own `ytd-menu-renderer` prevents clicking an item in a
 * different card's menu when one is already open; the document-wide fallback
 * covers builds that move the dropdown content elsewhere. Popups already on
 * screen before the menu button was pressed belong to an earlier interaction
 * and are never candidates: our own popup renders asynchronously, so without
 * the exclusion the fallback would act on a menu another card opened. Newer
 * builds may render items outside any known popup tag, so the last fallback
 * searches items document-wide excluding ones already visible before the click.
 */
function visibleMenuItems(menu, preexisting) {
  const pops = preexisting?.popups ?? preexisting;
  const items = preexisting?.items ?? new Set();
  const usable = (popup) => isVisible(popup) && !pops.has(popup);
  const usableItem = (item) => isVisible(item) && !items.has(item);
  const renderer = menu.closest('ytd-menu-renderer') ?? menu;
  let popups = [...renderer.querySelectorAll(POPUP_SELECTOR)].filter(usable);
  if (popups.length === 0) {
    popups = [...document.querySelectorAll(POPUP_SELECTOR)].filter(usable);
  }

  const found = [];
  for (const popup of popups) {
    for (const item of popup.querySelectorAll(ITEM_SELECTOR)) {
      if (!usableItem(item)) continue;
      // Nested paper items are already covered by their renderer wrapper.
      if (found.some((existing) => existing.contains(item))) continue;
      found.push(item);
    }
  }
  if (found.length > 0) return found;
  // Sheet-model fallback: items rendered outside the known popup tags.
  return [...document.querySelectorAll(ITEM_SELECTOR)].filter(usableItem);
}

function iconTypesOf(item) {
  const types = new Set();
  const push = (value) => {
    if (typeof value === 'string' && value) types.add(value.toUpperCase());
  };

  const data = dataOf(item);
  // `data` itself covers view models that put the icon at the top level; the
  // named properties cover menu service/navigation renderers. Newer builds
  // nest it deeper (listItemViewModel.leadingImage.sources[].clientResource),
  // so also deep-scan for icon/image keys.
  const renderers = [
    data,
    data?.menuServiceItemRenderer,
    data?.menuNavigationItemRenderer,
    data?.menuServiceItemViewModel,
    data?.listItemViewModel,
  ];
  for (const renderer of renderers) {
    if (!renderer) continue;
    push(renderer.icon?.iconType);
    push(renderer.icon?.iconName);
    push(renderer.leadingIcon?.iconType);
    push(renderer.leadingIcon?.iconName);
    push(renderer.trailingIcon?.iconType);
    push(renderer.trailingIcon?.iconName);
    push(renderer.iconType);
    push(renderer.iconName);
  }
  collectIconNames(data, push);

  for (const element of item.querySelectorAll('[icon], [icon-type], [data-icon-type]')) {
    push(element.getAttribute('icon'));
    push(element.getAttribute('icon-type'));
    push(element.getAttribute('data-icon-type'));
  }

  return [...types];
}

/**
 * Newer menu data nests the glyph at
 * `leadingImage.sources[].clientResource.imageName` (e.g. "HIDE" for
 * Not interested). Walk the data object and collect every icon/image name.
 */
function collectIconNames(root, push, depth = 0, seen = new Set()) {
  if (!root || depth > 6) return;
  if (typeof root !== 'object') return;
  if (seen.has(root)) return;
  seen.add(root);
  const values = Array.isArray(root) ? root : Object.entries(root);
  if (Array.isArray(root)) {
    for (const value of root) collectIconNames(value, push, depth + 1, seen);
    return;
  }
  for (const [key, value] of values) {
    if (
      (key === 'iconType' || key === 'iconName' || key === 'imageName') &&
      typeof value === 'string'
    ) {
      push(value);
    } else {
      collectIconNames(value, push, depth + 1, seen);
    }
  }
}

function svgPathsIn(root) {
  const paths = [...root.querySelectorAll('svg path')];
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) paths.push(...element.shadowRoot.querySelectorAll('svg path'));
  }
  return paths;
}

function hasNotInterestedPath(item) {
  for (const path of svgPathsIn(item)) {
    const value = path.getAttribute('d');
    if (value && NOT_INTERESTED_PATHS.has(compactPath(value))) return true;
  }
  return false;
}

function textMatches(item) {
  const label = normalizeText(
    `${item.getAttribute('aria-label') ?? ''} ${item.textContent ?? ''}`,
  );
  return TEXT_FALLBACKS.some((phrase) => label.includes(phrase));
}

/**
 * Decide whether a menu item is "Not interested".
 *
 * A recognized icon decides either way, so a localized label cannot override
 * it. Path and text checks are only consulted when the item exposes no icon
 * type at all — except for HIDE, whose name is shared with unrelated hide
 * actions: it only counts when the rendered path or the label corroborates.
 * Newer builds label the icon "HIDE" instead of "NOT_INTERESTED" (siblings
 * use ADD_TO_QUEUE_TAIL/WATCH_LATER/BOOKMARK_BORDER/SHARE/REMOVE/FLAG).
 */
function isNotInterested(item) {
  const types = iconTypesOf(item);
  if (types.length > 0) {
    if (types.some((type) => type.includes('NOT_INTERESTED'))) return true;
    if (types.includes('HIDE')) {
      return hasNotInterestedPath(item) || textMatches(item);
    }
    return false;
  }
  if (hasNotInterestedPath(item)) return true;
  return textMatches(item);
}

function findNotInterestedItem(menu, preexisting) {
  return visibleMenuItems(menu, preexisting).find(isNotInterested) ?? null;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForNotInterestedItem(menu, preexisting) {
  const deadline = Date.now() + MENU_TIMEOUT_MS;
  for (;;) {
    const item = findNotInterestedItem(menu, preexisting);
    if (item) return item;
    if (Date.now() >= deadline) return null;
    await delay(50);
  }
}

/** Close a menu we opened, without touching unrelated dialogs or snackbars. */
function closeMenus() {
  const menuOpen =
    [...document.querySelectorAll(POPUP_SELECTOR)].some(isVisible) ||
    [...document.querySelectorAll(ITEM_SELECTOR)].some(isVisible);
  if (!menuOpen) return;

  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true,
  });
  for (const target of [document.activeElement, document]) {
    target?.dispatchEvent(event);
  }
}

/**
 * Forward the click to YouTube's own menu action.
 *
 * The menu opens asynchronously, so the item is polled for at most one second.
 * When it never appears (for example on a card that only offers "Save"), the
 * menu is closed and nothing else is clicked.
 */
async function notInterested(card) {
  if (busy) return;
  busy = true;
  try {
    // A card can be reused for a Short/ad between scans; never act on it then.
    if (!isVideoCard(card)) {
      card.querySelector(`.${BUTTON_CLASS}`)?.remove();
      return;
    }

    const menu = cardMenu(card);
    if (!menu) return;

    // Menus already visible here were opened before this click; our popup has
    // not rendered yet, so the first poll would otherwise pick a foreign menu.
    const preexisting = {
      popups: new Set(
        [...document.querySelectorAll(POPUP_SELECTOR)].filter(isVisible),
      ),
      items: new Set(
        [...document.querySelectorAll(ITEM_SELECTOR)].filter(isVisible),
      ),
    };

    press(menu);
    const item = await waitForNotInterestedItem(menu, preexisting);
    if (!item) {
      closeMenus();
      return;
    }

    press(clickableWithin(item));
    closeMenus();
  } finally {
    busy = false;
  }
}

attachAll();

// A manager may run the script before <body> exists; observing null would
// throw and kill the whole script, including the navigation listeners below.
const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (
        node.matches(CARD_SELECTOR) ||
        node.closest(CARD_SELECTOR) ||
        node.querySelector(CARD_SELECTOR)
      ) {
        scheduleScan();
        return;
      }
    }
  }
});

function observe() {
  const root = document.body ?? document.documentElement;
  if (!root) return false;
  observer.observe(root, { childList: true, subtree: true });
  return true;
}

if (!observe()) {
  document.addEventListener('DOMContentLoaded', observe, { once: true });
}

document.addEventListener('yt-navigate-finish', () => attachAll());
document.addEventListener('yt-page-data-updated', () => attachAll());
