/**
 * Chapter navigation buttons on a YouTube watch page.
 *
 * The fixture fakes the player's currentTime and the chapter markersMap on
 * `ytd-app`'s page data, so the specs assert which time the script seeks to
 * rather than decoding video.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { injectAfterLoad, loadUserscript, matchUrl, serveHtml } = require('../testing');

const ROOT = path.resolve(__dirname, '..');
const BUILT = path.join(ROOT, 'dist', 'youtube-chapter-nav.user.js');
const WATCH_HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube-watch.html'), 'utf8');
const WATCH_URL = 'https://www.youtube.com/watch?v=chapter-test';

const nav = (page) => page.locator('#usj-chapter-nav');
const prevButton = (page) => page.getByRole('button', { name: 'Previous chapter' });
const nextButton = (page) => page.getByRole('button', { name: 'Next chapter' });
const lastSeek = (page) => page.evaluate(() => window.__seeks.at(-1) ?? null);

async function openWatchPage(page) {
  await serveHtml(page, WATCH_HTML, WATCH_URL);
  await page.goto(WATCH_URL);
  await injectAfterLoad(page, { file: BUILT });
  await expect(nav(page)).toHaveCount(1);
  await expect(nav(page)).toBeVisible();
}

test('the built banner targets YouTube and needs no GM grants', () => {
  const script = loadUserscript(BUILT);

  expect(script.meta.matches).toEqual(['*://*.youtube.com/*']);
  expect(script.meta.grants).toEqual(['none']);
  expect(script.meta['run-at']).toBe('document-end');
  expect(matchUrl(script.meta, WATCH_URL)).toBe(true);
  expect(matchUrl(script.meta, 'https://example.com/watch?v=chapter-test')).toBe(false);
});

test('the arrow buttons sit on the left and right edges and appear on hover', async ({ page }) => {
  await openWatchPage(page);

  await expect(nav(page)).not.toHaveClass(/usj-chapter-nav--visible/);
  await expect(prevButton(page)).toHaveText('<');
  await expect(nextButton(page)).toHaveText('>');

  const playerBox = await page.locator('#movie_player').boundingBox();
  const prevBox = await prevButton(page).boundingBox();
  const nextBox = await nextButton(page).boundingBox();

  expect(prevBox.x).toBeLessThan(playerBox.x + playerBox.width / 2);
  expect(nextBox.x + nextBox.width).toBeGreaterThan(playerBox.x + playerBox.width / 2);
  expect(prevBox.y).toBeGreaterThan(playerBox.y);
  expect(prevBox.y + prevBox.height).toBeLessThan(playerBox.y + playerBox.height);

  await page.hover('#movie_player');
  await expect(nav(page)).toHaveClass(/usj-chapter-nav--visible/);
});

test('hover still works when the page overrides addEventListener on the player', async ({ page }) => {
  // YouTube's player element drops mouseenter listeners registered through its
  // addEventListener wrapper, so the script must not rely on that path.
  await serveHtml(page, WATCH_HTML, WATCH_URL);
  await page.goto(WATCH_URL);
  await page.evaluate(() => {
    const element = document.querySelector('#movie_player');
    const native = element.addEventListener.bind(element);
    element.addEventListener = (type, listener, options) => {
      if (type !== 'mouseenter' && type !== 'mouseleave') native(type, listener, options);
    };
  });

  await injectAfterLoad(page, { file: BUILT });
  await expect(nav(page)).toHaveCount(1);

  await page.hover('#movie_player');
  await expect(nav(page)).toHaveClass(/usj-chapter-nav--visible/);

  await page.mouse.move(1200, 700);
  await expect(nav(page)).not.toHaveClass(/usj-chapter-nav--visible/);
});

test('next and previous move between chapters and handle the boundaries', async ({ page }) => {
  await openWatchPage(page);

  await expect(prevButton(page)).toHaveAttribute('title', 'Replay chapter: INTRO');
  await expect(nextButton(page)).toHaveAttribute('title', 'Next chapter: Rivals of Aether');

  // Nothing before INTRO: replay it from the start.
  await prevButton(page).click();
  expect(await lastSeek(page)).toBe(0);

  await nextButton(page).click();
  expect(await lastSeek(page)).toBe(43);
  await expect(prevButton(page)).toHaveAttribute('title', 'Previous chapter: INTRO');
  await expect(nextButton(page)).toHaveAttribute(
    'title',
    'Next chapter: Bloodstained: Curse of the Moon 2',
  );

  await nextButton(page).click();
  expect(await lastSeek(page)).toBe(85);
  await expect(nextButton(page)).toHaveAttribute('title', 'Skip to the end');

  // Nothing after the last chapter: jump to the end of the video.
  await nextButton(page).click();
  expect(await lastSeek(page)).toBe(120);
  await expect(prevButton(page)).toHaveAttribute('title', 'Previous chapter: Rivals of Aether');

  await prevButton(page).click();
  expect(await lastSeek(page)).toBe(43);
  await prevButton(page).click();
  expect(await lastSeek(page)).toBe(0);
  await prevButton(page).click();
  expect(await lastSeek(page)).toBe(0);

  expect(await page.evaluate(() => window.__seeks)).toEqual([0, 43, 85, 120, 43, 0, 0]);
});

test('the buttons hide when the video has no chapters', async ({ page }) => {
  await openWatchPage(page);

  await page.evaluate(() => {
    window.setChapters([]);
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });

  await expect(nav(page)).toBeHidden();
  await expect(page.locator('#usj-chapter-nav [data-direction="next"]')).toHaveAttribute(
    'title',
    'No chapters in this video',
  );
});

test('a SPA navigation reloads the chapter list without duplicating the buttons', async ({
  page,
}) => {
  await openWatchPage(page);

  await page.evaluate(() => {
    window.setChapters([
      { start: 0, title: 'Part one' },
      { start: 10, title: 'Part two' },
    ]);
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });

  await expect(nextButton(page)).toHaveAttribute('title', 'Next chapter: Part two');
  await nextButton(page).click();
  expect(await lastSeek(page)).toBe(10);

  await page.evaluate(() => document.dispatchEvent(new Event('yt-page-data-updated')));
  await expect(nav(page)).toHaveCount(1);
});

test('falls back to ytInitialData when ytd-app data is unavailable', async ({ page }) => {
  await openWatchPage(page);

  await page.evaluate(() => {
    window.setChapters([
      { start: 0, title: 'First' },
      { start: 20, title: 'Fallback only' },
    ]);
    window.ytInitialData = window.__response;
    delete document.querySelector('ytd-app').data;
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });

  await expect(nextButton(page)).toHaveAttribute('title', 'Next chapter: Fallback only');
});

test('does nothing on a YouTube page without a player', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const plain = fs.readFileSync(path.join(__dirname, 'fixtures', 'page.html'), 'utf8');
  await serveHtml(page, plain, 'https://www.youtube.com/feed/subscriptions');
  await page.goto('https://www.youtube.com/feed/subscriptions');
  await injectAfterLoad(page, { file: BUILT });

  await expect(nav(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
