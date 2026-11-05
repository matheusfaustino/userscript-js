/**
 * "Not interested" shortcut on YouTube video cards.
 *
 * The fixture fakes the card menu, so the specs assert that the overlay
 * forwards the click to the right item instead of navigating. Menu labels are
 * Portuguese in the fixture: matching English text would fail there.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { injectAfterLoad, loadUserscript, matchUrl, serveHtml } = require('../testing');

const ROOT = path.resolve(__dirname, '..');
const BUILT = path.join(ROOT, 'dist', 'youtube-thumbnail-actions.user.js');
const FEED_HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube-feed.html'), 'utf8');
const PLAIN_HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'page.html'), 'utf8');
const HOME_URL = 'https://www.youtube.com/';
const WATCH_URL = 'https://www.youtube.com/watch?v=feed-test';

// Kept in sync with the script: the exact Not interested glyph from YouTube's
// icon sprite (circle with a diagonal slash), the Watch later clock glyph, and
// the style values the acceptance criteria call out.
const ICON_PATH =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 ' +
  '3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 ' +
  '0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z';

const WATCH_LATER_GLYPH =
  'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2z' +
  'M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z';

const buttons = (page) => page.locator('.usj-ni-button');
const buttonIn = (page, id) => page.locator(`#${id} .usj-ni-button`);
const wlButtons = (page) => page.locator('.usj-wl-button');
const wlButtonIn = (page, id) => page.locator(`#${id} .usj-wl-button`);

async function openFeed(page, url = HOME_URL) {
  await serveHtml(page, FEED_HTML, url);
  await page.goto(url);
  await injectAfterLoad(page, { file: BUILT });
}

test('the built banner targets YouTube, needs no grants, and stays in page context', () => {
  const script = loadUserscript(BUILT);

  expect(script.meta.matches).toEqual(['*://*.youtube.com/*']);
  expect(script.meta.grants).toEqual(['none']);
  expect(script.meta['run-at']).toBe('document-end');
  // Deliberately no @inject-into: the DOM-only approach must work under the
  // manager default as well as in page context.
  expect(script.meta['inject-into']).toBeUndefined();
  expect(matchUrl(script.meta, HOME_URL)).toBe(true);
  expect(matchUrl(script.meta, WATCH_URL)).toBe(true);
  expect(matchUrl(script.meta, 'https://example.com/watch?v=feed-test')).toBe(false);
});

test('every video card on the home feed gets both buttons, Shorts and ads get none', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openFeed(page);

  await expect(buttons(page)).toHaveCount(6);
  await expect(buttonIn(page, 'card-home')).toHaveCount(1);
  await expect(buttonIn(page, 'card-lockup')).toHaveCount(1);
  await expect(buttonIn(page, 'card-new-ui')).toHaveCount(1);
  await expect(buttonIn(page, 'card-doc')).toHaveCount(1);
  await expect(page.locator('#card-shorts .usj-ni-button')).toHaveCount(0);
  await expect(page.locator('#card-ad .usj-ni-button')).toHaveCount(0);
  await expect(page.locator('#card-playlist .usj-ni-button')).toHaveCount(0);
  await expect(page.locator('#card-channel .usj-ni-button')).toHaveCount(0);

  // The Watch later button covers exactly the same cards.
  await expect(wlButtons(page)).toHaveCount(6);
  await expect(wlButtonIn(page, 'card-home')).toHaveCount(1);
  await expect(wlButtonIn(page, 'card-lockup')).toHaveCount(1);
  await expect(wlButtonIn(page, 'card-new-ui')).toHaveCount(1);
  await expect(wlButtonIn(page, 'card-doc')).toHaveCount(1);
  await expect(page.locator('#card-shorts .usj-wl-button')).toHaveCount(0);
  await expect(page.locator('#card-ad .usj-wl-button')).toHaveCount(0);
  await expect(page.locator('#card-playlist .usj-wl-button')).toHaveCount(0);
  await expect(page.locator('#card-channel .usj-wl-button')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the button is a YouTube-style circle in the thumbnail top-left and reveals on hover', async ({
  page,
}) => {
  await openFeed(page);

  const button = buttonIn(page, 'card-home');
  await expect(button).toHaveCount(1);
  await expect(button).toHaveCSS('position', 'absolute');
  await expect(button).toHaveCSS('width', '36px');
  await expect(button).toHaveCSS('height', '36px');
  await expect(button).toHaveCSS('border-radius', '50%');
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.8)');
  await expect(button).toHaveCSS('opacity', '0');

  const glyph = button.locator('svg path');
  await expect(glyph).toHaveCount(1);
  expect(await glyph.getAttribute('d')).toBe(ICON_PATH);

  const thumbnailBox = await page.locator('#card-home ytd-thumbnail').boundingBox();
  const buttonBox = await button.boundingBox();
  expect(buttonBox.x).toBeGreaterThanOrEqual(thumbnailBox.x);
  expect(buttonBox.y).toBeGreaterThanOrEqual(thumbnailBox.y);
  expect(buttonBox.x).toBeLessThan(thumbnailBox.x + thumbnailBox.width / 2);
  expect(buttonBox.y).toBeLessThan(thumbnailBox.y + thumbnailBox.height / 2);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    thumbnailBox.x + thumbnailBox.width,
  );

  await page.hover('#card-home ytd-thumbnail');
  await expect(button).toHaveCSS('opacity', '1');
});

test('clicking on the home feed runs the real Not interested item without navigating', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openFeed(page);
  const before = page.url();

  await buttonIn(page, 'card-home').click();

  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-home']);
  await expect.poll(() => page.evaluate(() => window.__menuOpens)).toEqual(['vid-home']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
  expect(page.url()).toBe(before);
  expect(errors).toEqual([]);
});

test('the watch-page sidebar works and finds the item by icon in a non-English locale', async ({
  page,
}) => {
  await openFeed(page, WATCH_URL);

  await expect(buttons(page)).toHaveCount(6);
  await page.hover('#card-sidebar ytd-thumbnail');
  await expect(buttonIn(page, 'card-sidebar')).toHaveCSS('opacity', '1');

  // The fixture's item has no iconType for this card; only the rendered
  // minus-circle path and the Portuguese label identify it.
  await buttonIn(page, 'card-sidebar').click();

  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-sidebar']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
  expect(page.url()).toBe(WATCH_URL);
});

test('a menu another card already opened never receives the click', async ({ page }) => {
  await openFeed(page);

  // The user opens the home card's menu, then clicks the overlay on a sidebar
  // card without dismissing the first menu.
  await page.click('#card-home ytd-menu-renderer #button');
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(1);

  await buttonIn(page, 'card-sidebar').click();

  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-sidebar']);
  expect(await page.evaluate(() => window.__menuOpens)).toContain('vid-home');
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
});

test('a card whose menu has no Not interested item times out without acting', async ({
  page,
}) => {
  await openFeed(page);

  await buttonIn(page, 'card-sidebar-2').click();

  await expect
    .poll(() => page.evaluate(() => window.__menuOpens))
    .toEqual(['vid-sidebar-2']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(1);
  // The script waits one second, then closes the menu it opened.
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0, { timeout: 3000 });
  expect(await page.evaluate(() => window.__notInterested)).toEqual([]);
  expect(page.url()).toBe(HOME_URL);
});

test('SPA navigation attaches buttons to new cards and never duplicates them', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openFeed(page);
  await expect(buttons(page)).toHaveCount(6);

  await page.evaluate(() => {
    window.addSidebarCard('vid-spa');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });

  await expect(buttons(page)).toHaveCount(7);
  await expect(buttonIn(page, 'card-vid-spa')).toHaveCount(1);

  await page.evaluate(() => document.dispatchEvent(new Event('yt-page-data-updated')));
  await expect(buttons(page)).toHaveCount(7);
  await expect(wlButtons(page)).toHaveCount(7);

  await buttonIn(page, 'card-vid-spa').click();
  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-spa']);
  expect(errors).toEqual([]);
});

test('a card reused for a Short loses its button on the next SPA refresh', async ({ page }) => {
  await openFeed(page);
  await expect(buttonIn(page, 'card-home')).toHaveCount(1);

  await page.evaluate(() => {
    for (const anchor of document.querySelectorAll('#card-home a')) {
      anchor.setAttribute('href', '/shorts/recycled');
    }
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });

  await expect(buttonIn(page, 'card-home')).toHaveCount(0);
  await expect(wlButtonIn(page, 'card-home')).toHaveCount(0);
});

test('a standalone lockup-view-model card gets a working button', async ({ page }) => {
  await openFeed(page);

  await expect(buttonIn(page, 'card-lockup')).toHaveCount(1);
  await page.hover('#card-lockup ytd-thumbnail');
  await expect(buttonIn(page, 'card-lockup')).toHaveCSS('opacity', '1');

  await buttonIn(page, 'card-lockup').click();

  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-lockup']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
  expect(page.url()).toBe(HOME_URL);
});

test('a document-level sheet menu never receives another card’s click', async ({ page }) => {
  await openFeed(page);

  // The home card's in-card menu is already open; the doc card's sheet renders
  // at document level (ytd-popup-container), like the live UI.
  await page.click('#card-home ytd-menu-renderer #button');
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(1);

  await buttonIn(page, 'card-doc').click();

  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-doc']);
  expect(await page.evaluate(() => window.__menuOpens)).toContain('vid-home');
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
});

test('the current yt-lockup card (thumbnail-view-model + button-view-model) gets a working button', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFeed(page);
  const before = page.url();

  const button = buttonIn(page, 'card-new-ui');
  await expect(button).toHaveCount(1);
  await page.hover('#card-new-ui yt-thumbnail-view-model');
  await expect(button).toHaveCSS('opacity', '1');

  await button.click();

  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-new-ui']);
  await expect.poll(() => page.evaluate(() => window.__menuOpens)).toContain('vid-new-ui');
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
  expect(page.url()).toBe(before);
  expect(errors).toEqual([]);
});

test('does nothing on a YouTube page without video cards', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await serveHtml(page, PLAIN_HTML, 'https://www.youtube.com/feed/subscriptions');
  await page.goto('https://www.youtube.com/feed/subscriptions');
  await injectAfterLoad(page, { file: BUILT });

  await expect(buttons(page)).toHaveCount(0);
  await expect(page.locator('#usj-ni-style')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Watch later button sits below the Not interested button and reveals on hover', async ({
  page,
}) => {
  await openFeed(page);

  const niButton = buttonIn(page, 'card-home');
  const wlButton = wlButtonIn(page, 'card-home');
  await expect(niButton).toHaveCount(1);
  await expect(wlButton).toHaveCount(1);

  await expect(wlButton).toHaveCSS('position', 'absolute');
  await expect(wlButton).toHaveCSS('top', '52px');
  await expect(wlButton).toHaveCSS('width', '36px');
  await expect(wlButton).toHaveCSS('height', '36px');
  await expect(wlButton).toHaveCSS('border-radius', '50%');
  await expect(wlButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.8)');
  await expect(wlButton).toHaveCSS('opacity', '0');

  const glyph = wlButton.locator('svg path');
  await expect(glyph).toHaveCount(1);
  expect(await glyph.getAttribute('d')).toBe(WATCH_LATER_GLYPH);

  // Stacked below the Not interested button, without overlapping it, and
  // inside the thumbnail bounds.
  const thumbnailBox = await page.locator('#card-home ytd-thumbnail').boundingBox();
  const niBox = await niButton.boundingBox();
  const wlBox = await wlButton.boundingBox();
  expect(wlBox.y).toBeGreaterThanOrEqual(niBox.y + niBox.height);
  expect(wlBox.x).toBeGreaterThanOrEqual(thumbnailBox.x);
  expect(wlBox.y).toBeGreaterThanOrEqual(thumbnailBox.y);
  expect(wlBox.x + wlBox.width).toBeLessThanOrEqual(
    thumbnailBox.x + thumbnailBox.width,
  );
  expect(wlBox.y + wlBox.height).toBeLessThanOrEqual(
    thumbnailBox.y + thumbnailBox.height,
  );

  await page.hover('#card-home ytd-thumbnail');
  await expect(niButton).toHaveCSS('opacity', '1');
  await expect(wlButton).toHaveCSS('opacity', '1');
});

test('both stacked buttons stay inside a small (168x94) sidebar thumbnail', async ({
  page,
}) => {
  await openFeed(page);

  const niButton = buttonIn(page, 'card-sidebar');
  const wlButton = wlButtonIn(page, 'card-sidebar');
  await expect(niButton).toHaveCount(1);
  await expect(wlButton).toHaveCount(1);

  // Compact sidebar thumbnails are ~168x94; offset + circles + gap must fit.
  const thumbnailBox = await page.locator('#card-sidebar ytd-thumbnail').boundingBox();
  const niBox = await niButton.boundingBox();
  const wlBox = await wlButton.boundingBox();
  for (const box of [niBox, wlBox]) {
    expect(box.x).toBeGreaterThanOrEqual(thumbnailBox.x);
    expect(box.y).toBeGreaterThanOrEqual(thumbnailBox.y);
    expect(box.x + box.width).toBeLessThanOrEqual(thumbnailBox.x + thumbnailBox.width);
    expect(box.y + box.height).toBeLessThanOrEqual(thumbnailBox.y + thumbnailBox.height);
  }
  expect(wlBox.y).toBeGreaterThanOrEqual(niBox.y + niBox.height);
});

test('the Watch later button runs the real Save to Watch later item without navigating', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openFeed(page);
  const before = page.url();

  await wlButtonIn(page, 'card-home').click();

  await expect
    .poll(() => page.evaluate(() => window.__watchLater))
    .toEqual(['vid-home']);
  await expect.poll(() => page.evaluate(() => window.__menuOpens)).toEqual(['vid-home']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
  expect(page.url()).toBe(before);
  expect(errors).toEqual([]);
});

test('the Watch later button finds a path-less item by its clock icon in a non-English locale', async ({
  page,
}) => {
  await openFeed(page);

  // card-sidebar's item has no iconType and a Portuguese label; only the
  // rendered clock path identifies it.
  await wlButtonIn(page, 'card-sidebar').click();

  await expect
    .poll(() => page.evaluate(() => window.__watchLater))
    .toEqual(['vid-sidebar']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0);
  expect(page.url()).toBe(HOME_URL);
});

test('a card whose menu has no Watch later item times out without acting', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openFeed(page);

  // card-new-ui's sheet menu only offers Not interested (icon "HIDE", no
  // clock path, Portuguese label): HIDE must not be read as Watch later.
  await wlButtonIn(page, 'card-new-ui').click();

  await expect
    .poll(() => page.evaluate(() => window.__menuOpens))
    .toEqual(['vid-new-ui']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(1);
  // The script waits one second, then closes the menu it opened.
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0, {
    timeout: 3000,
  });
  expect(await page.evaluate(() => window.__watchLater)).toEqual([]);
  expect(await page.evaluate(() => window.__notInterested)).toEqual([]);
  expect(page.url()).toBe(HOME_URL);
  expect(errors).toEqual([]);
});

test('the two buttons share one guard, so they never race each other', async ({
  page,
}) => {
  await openFeed(page);

  // card-new-ui keeps the guard busy for the full one-second timeout.
  await wlButtonIn(page, 'card-new-ui').click();
  // A click on the other button while it runs is dropped, not interleaved.
  await buttonIn(page, 'card-home').click();

  await expect
    .poll(() => page.evaluate(() => window.__menuOpens))
    .toEqual(['vid-new-ui']);
  await expect(page.locator('ytd-menu-popup-renderer, yt-sheet-view-model')).toHaveCount(0, {
    timeout: 3000,
  });
  expect(await page.evaluate(() => window.__watchLater)).toEqual([]);
  expect(await page.evaluate(() => window.__notInterested)).toEqual([]);

  // Once the guard is free again, the Not interested button works as usual.
  await buttonIn(page, 'card-home').click();
  await expect
    .poll(() => page.evaluate(() => window.__notInterested))
    .toEqual(['vid-home']);
});
