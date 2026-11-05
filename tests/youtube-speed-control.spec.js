/**
 * Playback speed chip on a YouTube watch page.
 *
 * The fixture's `<video>` has no media resource, so `playbackRate` is set and
 * read without decoding anything; `play` and `ratechange` are dispatched by
 * hand where the script's re-apply behaviour matters.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { injectAfterLoad, loadUserscript, matchUrl, serveHtml } = require('../testing');

const ROOT = path.resolve(__dirname, '..');
const BUILT = path.join(ROOT, 'dist', 'youtube-speed-control.user.js');
const WATCH_HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'youtube-watch.html'), 'utf8');
const WATCH_URL = 'https://www.youtube.com/watch?v=speed-test';
const RATE_KEY = 'youtube-speed-control:rate';

const chip = (page) => page.locator('#usj-speed-control');
const display = (page) => chip(page).locator('[data-action="toggle"]');
const slower = (page) => chip(page).locator('[data-action="slower"]');
const faster = (page) => chip(page).locator('[data-action="faster"]');
const video = (page) => page.locator('#movie_player video');
const videoRate = (page) => video(page).evaluate((element) => element.playbackRate);

/** The chip starts faded out; hovering the player also makes it clickable. */
async function openWatchPage(page, { reveal = true, seed } = {}) {
  await serveHtml(page, WATCH_HTML, WATCH_URL);
  await page.goto(WATCH_URL);
  await injectAfterLoad(page, { file: BUILT, seed });
  await expect(chip(page)).toHaveCount(1);
  if (reveal) await page.hover('#movie_player');
}

test('the built banner targets YouTube with the GM grants the script uses', () => {
  const script = loadUserscript(BUILT);

  expect(script.meta.matches).toEqual(['*://*.youtube.com/*']);
  expect(script.meta.grants).toEqual([
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_registerMenuCommand',
  ]);
  expect(script.meta['run-at']).toBe('document-end');
  expect(matchUrl(script.meta, WATCH_URL)).toBe(true);
  expect(matchUrl(script.meta, 'https://example.com/watch?v=speed-test')).toBe(false);
});

test('the chip mounts inside the player top-right and fades in on hover', async ({ page }) => {
  await openWatchPage(page, { reveal: false });

  await expect(page.locator('#movie_player > #usj-speed-control')).toHaveCount(1);
  await expect(chip(page)).toHaveCSS('position', 'absolute');
  await expect(chip(page)).toHaveCSS('border-radius', '16px');
  await expect(chip(page)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.6)');
  await expect(chip(page)).toHaveCSS('font-size', '13px');
  await expect(display(page)).toHaveText('1x');
  await expect(slower(page)).toHaveAttribute('aria-label', 'Slower');
  await expect(faster(page)).toHaveAttribute('aria-label', 'Faster');

  const playerBox = await page.locator('#movie_player').boundingBox();
  const chipBox = await chip(page).boundingBox();
  expect(Math.round(chipBox.x + chipBox.width)).toBe(
    Math.round(playerBox.x + playerBox.width - 12),
  );
  expect(Math.round(chipBox.y)).toBe(Math.round(playerBox.y + 12));

  await expect(chip(page)).toHaveCSS('opacity', '0');
  await page.hover('#movie_player');
  await expect(chip(page)).toHaveCSS('opacity', '1');

  await page.mouse.move(5, 700);
  await expect(chip(page)).toHaveCSS('opacity', '0');
});

test('the +/- buttons step the rate by 0.25x and stop at the range bounds', async ({ page }) => {
  await openWatchPage(page);
  await expect.poll(() => videoRate(page)).toBe(1);

  await faster(page).click();
  await expect.poll(() => videoRate(page)).toBe(1.25);
  await expect(display(page)).toHaveText('1.25x');

  await faster(page).click();
  await expect.poll(() => videoRate(page)).toBe(1.5);
  await expect(display(page)).toHaveText('1.5x');

  await slower(page).click();
  await expect.poll(() => videoRate(page)).toBe(1.25);
  await expect(display(page)).toHaveText('1.25x');

  await page.evaluate(() => {
    for (let index = 0; index < 8; index += 1) {
      document.querySelector('#usj-speed-control [data-action="slower"]').click();
    }
  });
  await expect.poll(() => videoRate(page)).toBe(0);
  await expect(display(page)).toHaveText('0x');
  await expect(slower(page)).toBeDisabled();

  await page.evaluate(() => {
    for (let index = 0; index < 80; index += 1) {
      document.querySelector('#usj-speed-control [data-action="faster"]').click();
    }
  });
  await expect.poll(() => videoRate(page)).toBe(16);
  await expect(display(page)).toHaveText('16x');
  await expect(faster(page)).toBeDisabled();
});

test('the center button toggles between 1x and the last rate', async ({ page }) => {
  await openWatchPage(page);

  await faster(page).click();
  await faster(page).click();
  await expect(display(page)).toHaveText('1.5x');

  await display(page).click();
  await expect(display(page)).toHaveText('1x');
  await expect.poll(() => videoRate(page)).toBe(1);

  await display(page).click();
  await expect(display(page)).toHaveText('1.5x');
  await expect.poll(() => videoRate(page)).toBe(1.5);
});

test('keyboard shortcuts step the rate and reset it to 1x', async ({ page }) => {
  await openWatchPage(page);

  await page.keyboard.press('=');
  await expect.poll(() => videoRate(page)).toBe(1.25);

  await page.keyboard.press('NumpadAdd');
  await expect.poll(() => videoRate(page)).toBe(1.5);

  await page.keyboard.press('-');
  await expect.poll(() => videoRate(page)).toBe(1.25);

  await page.keyboard.press('NumpadSubtract');
  await expect.poll(() => videoRate(page)).toBe(1);

  await page.keyboard.press('NumpadAdd');
  await expect.poll(() => videoRate(page)).toBe(1.25);

  await page.keyboard.press('NumpadMultiply');
  await expect.poll(() => videoRate(page)).toBe(1);
  await expect(display(page)).toHaveText('1x');
});

test('shift+wheel steps the rate, scoped to the player and off without Shift', async ({
  page,
}) => {
  await openWatchPage(page);

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -120);
  await expect.poll(() => videoRate(page)).toBe(1.25);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => videoRate(page)).toBe(1);
  await page.keyboard.up('Shift');

  await page.mouse.wheel(0, -240);
  await expect.poll(() => videoRate(page)).toBe(1);
});

test('the wheel direction can be inverted from the stored setting', async ({ page }) => {
  await openWatchPage(page, {
    seed: { 'youtube-speed-control:invert-wheel': true },
  });

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -120);
  await expect.poll(() => videoRate(page)).toBe(0.75);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => videoRate(page)).toBe(1);
  await page.keyboard.up('Shift');
});

test('the chosen rate persists across reloads through GM storage', async ({ page }) => {
  await openWatchPage(page);

  await faster(page).click();
  await faster(page).click();
  await expect(display(page)).toHaveText('1.5x');

  expect(await page.evaluate((key) => GM_getValue(key), RATE_KEY)).toBe('1.5');

  await page.reload();
  await injectAfterLoad(page, { file: BUILT });

  await expect(chip(page)).toHaveCount(1);
  await expect(display(page)).toHaveText('1.5x');
  await expect.poll(() => videoRate(page)).toBe(1.5);
});

test('re-applies the saved rate when playback restarts at 1x', async ({ page }) => {
  await openWatchPage(page);

  await faster(page).click();
  await expect.poll(() => videoRate(page)).toBe(1.25);

  await page.evaluate(() => {
    const media = document.querySelector('#movie_player video');
    media.playbackRate = 1;
    media.dispatchEvent(new Event('play'));
  });

  await expect.poll(() => videoRate(page)).toBe(1.25);
  await expect(display(page)).toHaveText('1.25x');
});

test('ads keep their own rate and the chip returns when the ad ends', async ({ page }) => {
  await openWatchPage(page);

  await faster(page).click();
  await expect(display(page)).toHaveText('1.25x');

  await page.evaluate(() => {
    document.querySelector('#movie_player').classList.add('ad-showing');
    document.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await expect(chip(page)).toBeHidden();

  await page.evaluate(() => {
    const media = document.querySelector('#movie_player video');
    media.playbackRate = 1;
    media.dispatchEvent(new Event('play'));
  });
  await expect.poll(() => videoRate(page)).toBe(1);
  await expect(display(page)).toHaveText('1.25x');

  await page.evaluate(() => {
    document.querySelector('#movie_player').classList.remove('ad-showing');
    document.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await expect(chip(page)).toBeVisible();
  await expect.poll(() => videoRate(page)).toBe(1.25);
});

test('SPA navigation into a watch page mounts the chip without duplicating it', async ({ page }) => {
  const homeHtml = WATCH_HTML.replace('id="movie_player"', 'id="movie_player" hidden');
  await serveHtml(page, homeHtml, 'https://www.youtube.com/');
  await page.goto('https://www.youtube.com/');
  await injectAfterLoad(page, { file: BUILT });

  await expect(chip(page)).toHaveCount(1);

  await page.evaluate(() => {
    document.querySelector('#movie_player').hidden = false;
    history.pushState({}, '', '/watch?v=speed-test');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });

  await expect(chip(page)).toHaveCount(1);
  await expect(display(page)).toHaveText('1x');
});

test('a player swap during the reveal window leaves no timer for the new chip', async ({
  page,
}) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openWatchPage(page);
  await page.keyboard.press('=');
  await expect(display(page)).toHaveText('1.25x');

  // The timer only fades when the pointer is outside, so give a leaked timer
  // the condition it acts on.
  await page.mouse.move(5, 700);
  await expect(chip(page)).toHaveCSS('opacity', '0');

  // Detach the player while the reveal is still pending: the timer outlives the
  // chip it was created for.
  await page.evaluate(() => {
    window.__detachedPlayer = document.querySelector('#movie_player');
    window.__detachedPlayer.remove();
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(chip(page)).toHaveCount(0);
  await page.waitForTimeout(1_400);
  expect(pageErrors).toEqual([]);

  await page.evaluate(() => {
    document.body.append(window.__detachedPlayer);
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(chip(page)).toHaveCount(1);

  // Arm another reveal, swap the player inside its window, and mark the
  // replacement chip visible the way reveal() does. A timer owned by the old
  // chip must not remove that class.
  await page.keyboard.press('=');
  await page.mouse.move(5, 700);
  await page.evaluate(() => {
    window.__detachedPlayer.remove();
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(chip(page)).toHaveCount(0);
  await page.evaluate(() => {
    document.body.append(window.__detachedPlayer);
    document.dispatchEvent(new Event('yt-navigate-finish'));
    document.querySelector('#usj-speed-control').classList.add('usj-speed-control--visible');
  });
  await expect(chip(page)).toHaveCount(1);
  await expect(chip(page)).toHaveCSS('opacity', '1');

  await page.waitForTimeout(1_400);
  await expect(chip(page)).toHaveClass(/usj-speed-control--visible/);

  await page.mouse.move(250, 700);
  await expect(chip(page)).toHaveCSS('opacity', '0');
  expect(pageErrors).toEqual([]);
});

test('adopts a rate chosen outside the chip instead of overwriting it on play', async ({
  page,
}) => {
  await openWatchPage(page);
  await expect.poll(() => videoRate(page)).toBe(1);

  // Stands in for YouTube's own speed menu: it sets playbackRate and fires
  // ratechange on media that is already loaded.
  await page.evaluate(() => {
    const media = document.querySelector('#movie_player video');
    Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
    media.playbackRate = 1.5;
    media.dispatchEvent(new Event('ratechange'));
  });

  await expect(display(page)).toHaveText('1.5x');
  expect(await page.evaluate((key) => GM_getValue(key), RATE_KEY)).toBe('1.5');

  // A playback restart resets the media to 1x; the adopted rate, not the old
  // stored one, is what the script re-applies.
  await page.evaluate(() => {
    const media = document.querySelector('#movie_player video');
    media.playbackRate = 1;
    media.dispatchEvent(new Event('play'));
  });

  await expect.poll(() => videoRate(page)).toBe(1.5);
  await expect(display(page)).toHaveText('1.5x');
  expect(await page.evaluate((key) => GM_getValue(key), RATE_KEY)).toBe('1.5');
});
