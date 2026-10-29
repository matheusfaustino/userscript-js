/**
 * Shim fidelity: the values a script writes through GM_* must read back with
 * the same type, as they do under Tampermonkey. `createStore` parses JSON on
 * its own, so it hides a shim that returns raw strings — these tests call the
 * GM_* API directly to keep that contract honest.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { injectAtStart, serveHtml } = require('../testing');

const SCRIPT = path.join(__dirname, '..', 'dist', 'demo.user.js');
const HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'page.html'), 'utf8');
const URL = 'https://demo.userscript.test/demo/shim.html';

async function open(page) {
  await serveHtml(page, HTML, URL);
  await injectAtStart(page, { file: SCRIPT });
  await page.goto(URL);
}

test('GM values round-trip with their original type', async ({ page }) => {
  await open(page);

  const readBack = await page.evaluate(() => {
    GM_setValue('type:number', 42);
    GM_setValue('type:string', 'hello');
    GM_setValue('type:boolean', false);
    GM_setValue('type:object', { list: [1, 2] });
    GM_setValue('type:null', null);

    return {
      number: GM_getValue('type:number'),
      string: GM_getValue('type:string'),
      boolean: GM_getValue('type:boolean'),
      object: GM_getValue('type:object'),
      nul: GM_getValue('type:null'),
      missing: GM_getValue('type:missing', 'fallback'),
    };
  });

  expect(readBack).toEqual({
    number: 42,
    string: 'hello',
    boolean: false,
    object: { list: [1, 2] },
    nul: null,
    missing: 'fallback',
  });
});

test('a string that looks like JSON stays a string', async ({ page }) => {
  await open(page);

  const value = await page.evaluate(() => {
    GM_setValue('type:jsonish', '{"a":1}');
    return GM_getValue('type:jsonish');
  });

  expect(value).toBe('{"a":1}');
});
