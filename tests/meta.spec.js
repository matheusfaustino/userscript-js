/**
 * Checks the banner that ships in dist/demo.user.js and the @match evaluator
 * that decides whether a page is covered at all.
 */

const path = require('node:path');
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const {
  matchPatternToRegExp,
  matchesUrl,
  parseMetadata,
  serializeMetadata,
} = require('../src/meta.js');
const { loadUserscript, matchUrl } = require('../testing');

const ROOT = path.resolve(__dirname, '..');
const BUILT = path.join(ROOT, 'dist', 'demo.user.js');
const TEST_URL = 'https://demo.userscript.test/demo/page.html';
const pkg = require('../package.json');

const script = loadUserscript(BUILT);

test('the built banner parses into the fields the manager needs', () => {
  expect(script.meta.name).toBe('userscript-js demo');
  expect(script.meta.version).toBe(pkg.version);
  expect(script.meta['run-at']).toBe('document-end');
  expect(script.meta.matches).toEqual(['*://*.userscript.test/demo/*']);
  expect(script.meta.grants).toEqual([
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_registerMenuCommand',
  ]);
  expect(script.source.startsWith('// ==UserScript==')).toBe(true);
});

test('the bundle has no CommonJS calls left in it', () => {
  // esbuild bundles every import; a surviving require() means a dependency was
  // left external and the file would fail inside a manager sandbox.
  expect(script.body).not.toMatch(/\brequire\s*\(/);
  expect(script.meta.raw).not.toBe(script.source);
});

test('serializeMetadata round-trips through parseMetadata', () => {
  const meta = {
    name: 'round trip',
    version: '1.2.3',
    description: 'plain text',
    match: ['https://example.com/*', '*://*.example.org/path/*'],
    grant: ['GM_getValue'],
    'run-at': 'document-start',
    'inject-into': 'page',
  };

  const parsed = parseMetadata(serializeMetadata(meta));

  expect(parsed.name).toBe(meta.name);
  expect(parsed.version).toBe(meta.version);
  expect(parsed.matches).toEqual(meta.match);
  expect(parsed.grants).toEqual(meta.grant);
  expect(parsed['run-at']).toBe('document-start');
  expect(parsed['inject-into']).toBe('page');
  expect(parseMetadata(serializeMetadata(parsed)).matches).toEqual(meta.match);
});

test('@match patterns convert to the URLs they declare', () => {
  const table = [
    ['*://*.userscript.test/demo/*', 'https://demo.userscript.test/demo/page.html', true],
    ['*://*.userscript.test/demo/*', 'http://userscript.test/demo/x', true],
    ['*://*.userscript.test/demo/*', 'https://demo.userscript.test/other/page.html', false],
    ['https://example.com/*', 'https://example.com/anything?q=1', true],
    ['https://example.com/*', 'http://example.com/anything', false],
    ['https://example.com/*', 'https://sub.example.com/anything', false],
    ['*://*/*', 'https://any.host/some/path', true],
    ['<all_urls>', 'file:///tmp/page.html', true],
    ['<all_urls>', 'https://example.com/', true],
  ];

  for (const [pattern, url, expected] of table) {
    expect(matchPatternToRegExp(pattern).test(url), `${pattern} vs ${url}`).toBe(expected);
  }

  expect(() => matchPatternToRegExp('not a pattern')).toThrow(/Invalid @match pattern/);
});

test('@exclude wins over @match, and @include fills the gaps', () => {
  const meta = {
    matches: ['https://example.com/*'],
    includes: ['https://*.example.org/*'],
    excludes: ['https://example.com/private/*'],
  };

  expect(matchesUrl(meta, 'https://example.com/public')).toBe(true);
  expect(matchesUrl(meta, 'https://example.com/private/a')).toBe(false);
  expect(matchesUrl(meta, 'https://app.example.org/x')).toBe(true);
  expect(matchesUrl(meta, 'https://elsewhere.test/x')).toBe(false);
  expect(matchesUrl(null, 'https://example.com/')).toBe(false);
});

test("the demo's @match covers the fixture URL and rejects off-target pages", () => {
  expect(matchUrl(script.meta, TEST_URL)).toBe(true);
  expect(matchUrl(script.meta, 'https://demo.userscript.test/demo/')).toBe(true);
  expect(matchUrl(script.meta, 'https://example.com/demo/page.html')).toBe(false);
  expect(matchUrl(script.meta, 'https://demo.userscript.test/')).toBe(false);
});

test('the fixture file exists for the demo spec to serve', () => {
  expect(fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'page.html'))).toBe(true);
});
