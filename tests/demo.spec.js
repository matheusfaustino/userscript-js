/**
 * End-to-end checks for the demo userscript on both storage backends.
 *
 * Each test gets a fresh browser context, so the only state that survives a
 * reload is what the script itself persisted.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  GM_PREFIX,
  injectAfterLoad,
  injectAtStart,
  serveHtml,
} = require('../testing');

const ROOT = path.resolve(__dirname, '..');
const BUILT = path.join(ROOT, 'dist', 'demo.user.js');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'page.html'), 'utf8');
const PAGE_URL = 'https://demo.userscript.test/demo/page.html';
const STORE_KEY = 'userscript-js:demo-count';

const widget = (page) => page.locator('#userscript-js-demo');
const counter = (page) => page.locator('#userscript-js-demo-count');

async function openWith(page, options) {
  await serveHtml(page, FIXTURE, PAGE_URL);
  await injectAtStart(page, { file: BUILT, ...options });
  await page.goto(PAGE_URL);
  await expect(widget(page)).toBeVisible();
}

test('mounts with the shimmed GM backend and increments', async ({ page }) => {
  await openWith(page, {});

  await expect(widget(page)).toHaveAttribute('data-backend', 'gm');
  await expect(counter(page)).toHaveText('0');

  await page.getByRole('button', { name: '+1' }).click();
  await expect(counter(page)).toHaveText('1');

  const stored = await page.evaluate(
    ({ prefix, key }) => localStorage.getItem(prefix + key),
    { prefix: GM_PREFIX, key: STORE_KEY },
  );
  expect(stored).toBe('1');
});

test('the GM-backed value survives a reload', async ({ page }) => {
  await openWith(page, {});

  await page.getByRole('button', { name: '+1' }).click();
  await page.getByRole('button', { name: '+1' }).click();
  await expect(counter(page)).toHaveText('2');

  await page.reload();
  await expect(widget(page)).toBeVisible();
  await expect(counter(page)).toHaveText('2');
  await expect(widget(page)).toHaveAttribute('data-backend', 'gm');
});

test('registers the GM menu command and runs it', async ({ page }) => {
  await openWith(page, {});

  const captions = await page.evaluate(() =>
    window.__userscriptTest.menuCommands.map((command) => command.caption),
  );
  expect(captions).toContain('Reset demo counter');

  await page.getByRole('button', { name: '+1' }).click();
  await expect(counter(page)).toHaveText('1');

  await page.evaluate(() => window.__userscriptTest.runMenuCommand('Reset demo counter'));
  await expect(counter(page)).toHaveText('0');
  await expect
    .poll(() =>
      page.evaluate(
        ({ prefix, key }) => localStorage.getItem(prefix + key),
        { prefix: GM_PREFIX, key: STORE_KEY },
      ),
    )
    .toBe('0');
});

test('falls back to localStorage when no GM grant is supplied', async ({ page }) => {
  await openWith(page, { grants: [] });

  await expect(widget(page)).toHaveAttribute('data-backend', 'local');
  await expect
    .poll(() => page.evaluate(() => window.__userscriptTest.grants))
    .toEqual([]);

  await page.getByRole('button', { name: '+1' }).click();
  await expect(counter(page)).toHaveText('1');

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain(STORE_KEY);
  expect(keys.some((key) => key.startsWith('__usj_gm:'))).toBe(false);

  await page.reload();
  await expect(widget(page)).toBeVisible();
  await expect(counter(page)).toHaveText('1');
  await expect(widget(page)).toHaveAttribute('data-backend', 'local');
});

test('injectAfterLoad mounts a document-end script', async ({ page }) => {
  await serveHtml(page, FIXTURE, PAGE_URL);
  await page.goto(PAGE_URL);

  await injectAfterLoad(page, { file: BUILT });

  await expect(widget(page)).toBeVisible();
  await expect(counter(page)).toHaveText('0');
});

test('seeded GM values are read by createStore', async ({ page }) => {
  await openWith(page, { seed: { [STORE_KEY]: 7 } });

  await expect(counter(page)).toHaveText('7');
});

test('an unstubbed GM API throws instead of silently doing nothing', async ({ page }) => {
  await serveHtml(page, FIXTURE, PAGE_URL);
  await injectAtStart(page, { file: BUILT, grants: ['GM_xmlhttpRequest'] });
  await page.goto(PAGE_URL);

  const message = await page.evaluate(() => {
    try {
      GM_xmlhttpRequest({ method: 'GET', url: 'https://example.com/' });
      return 'no error';
    } catch (error) {
      return error.message;
    }
  });

  expect(message).toMatch(/not stubbed/);
});

test('an unsupported grant fails at injection time', async ({ page }) => {
  await expect(
    injectAtStart(page, { file: BUILT, grants: ['GM_getResourceText'] }),
  ).rejects.toThrow(/does not implement GM_getResourceText/);
});
