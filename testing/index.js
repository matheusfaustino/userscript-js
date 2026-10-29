/**
 * Playwright harness for built userscripts.
 *
 * Tests inject the same bundle a user would install, so bundle-level mistakes
 * (banner drift, a leftover `require`, a broken top-level import) surface here
 * instead of after a manual install. Tampermonkey itself is never loaded: it
 * cannot be side-loaded reliably any more, and the parts under test are the
 * script and its storage fallback, not the manager UI.
 *
 * All GM_* values live in `localStorage` under `__usj_gm:`, which is what makes
 * state survive `page.reload()`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { matchesUrl, parseMetadata, stripMetadata } = require('../src/meta.js');

const GM_PREFIX = '__usj_gm:';

/**
 * Grants the shim can honour. Anything else throws at injection time so a test
 * never passes against a silently missing API.
 */
const SUPPORTED_GRANTS = new Set([
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM_notification',
  'GM_addStyle',
  'GM_xmlhttpRequest',
]);

/**
 * Read a built userscript and split its banner from its body.
 *
 * @param {string} file path to a built `.user.js`
 * @returns {{ file: string, source: string, body: string, meta: NonNullable<ReturnType<typeof parseMetadata>> }}
 */
function loadUserscript(file) {
  const resolved = path.resolve(file);
  const source = fs.readFileSync(resolved, 'utf8');
  const meta = parseMetadata(source);
  if (!meta) throw new Error(`${resolved}: no ==UserScript== metadata block`);
  return { file: resolved, source, body: stripMetadata(source), meta };
}

/**
 * Resolve the grants a test wants: the explicit list, or the script's banner.
 *
 * `@grant none` means "no GM APIs", so it resolves to an empty list rather
 * than a shim that defines a grant called `none`.
 *
 * @param {{ grants: string[] }} meta
 * @param {string[] | undefined} grants
 * @returns {string[]}
 */
function resolveGrants(meta, grants) {
  const requested = grants === undefined ? meta.grants : grants;
  return requested.filter((grant) => grant && grant !== 'none');
}

function assertSupportedGrants(grants, file) {
  const unsupported = grants.filter((grant) => !SUPPORTED_GRANTS.has(grant));
  if (unsupported.length === 0) return;
  throw new Error(
    `${path.basename(file)}: test shim does not implement ${unsupported.join(', ')}; ` +
      `supported grants are ${[...SUPPORTED_GRANTS].join(', ')}`,
  );
}

/**
 * Run inside the page before any script. Serialised into the init script, so it
 * must not reference anything outside its argument.
 *
 * @param {{ grants: string[], seed: Record<string, unknown>, prefix: string }} config
 */
function installShim(config) {
  const prefix = config.prefix;
  const memory = new Map();
  const readRaw = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return memory.has(key) ? memory.get(key) : null;
    }
  };
  const writeRaw = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      memory.set(key, value);
    }
  };
  const removeRaw = (key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      memory.delete(key);
    }
  };

  const state = {
    grants: config.grants.slice(),
    menuCommands: [],
    notifications: [],
    logs: [],
  };
  window.__userscriptTest = state;

  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      state.logs.push({ level, args });
      original(...args);
    };
  }

  const gmKey = (key) => prefix + key;

  // Seed only absent keys: an init script re-runs on reload, and reseeding
  // would wipe the state the test is trying to observe.
  for (const [key, value] of Object.entries(config.seed)) {
    const target = config.grants.length > 0 ? gmKey(key) : key;
    if (readRaw(target) === null) writeRaw(target, JSON.stringify(value));
  }

  const api = {
    GM_getValue(key, defaultValue) {
      const raw = readRaw(gmKey(key));
      if (raw === null || raw === undefined) return defaultValue;
      return raw;
    },
    GM_setValue(key, value) {
      writeRaw(gmKey(key), typeof value === 'string' ? value : JSON.stringify(value));
    },
    GM_deleteValue(key) {
      removeRaw(gmKey(key));
    },
    GM_listValues() {
      const keys = [];
      try {
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key && key.startsWith(prefix)) keys.push(key.slice(prefix.length));
        }
      } catch (error) {
        for (const key of memory.keys()) {
          if (key.startsWith(prefix)) keys.push(key.slice(prefix.length));
        }
      }
      return keys;
    },
    GM_registerMenuCommand(caption, run, accessKey) {
      state.menuCommands.push({ id: caption, caption, accessKey, run });
    },
    GM_unregisterMenuCommand(caption) {
      state.menuCommands = state.menuCommands.filter((command) => command.caption !== caption);
    },
    GM_notification(details) {
      state.notifications.push(typeof details === 'string' ? { text: details } : { ...details });
    },
    GM_addStyle(css) {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).append(style);
      return style;
    },
    GM_xmlhttpRequest() {
      throw new Error(
        'GM_xmlhttpRequest is not stubbed by userscript-js; stub it in the test ' +
          '(page.route plus window.__userscriptTest) or move the request behind an injectable seam.',
      );
    },
  };

  for (const grant of config.grants) window[grant] = api[grant];

  state.runMenuCommand = (caption) => {
    const command = state.menuCommands.find((entry) => entry.caption === caption);
    if (!command) throw new Error(`No GM menu command registered: ${caption}`);
    command.run();
  };
}

function buildContent({ grants, seed, body }) {
  const config = { grants, seed: seed || {}, prefix: GM_PREFIX };
  return `(${installShim.toString()})(${JSON.stringify(config)});\n${body}`;
}

/**
 * Inject a userscript at document-start. Must be called before `page.goto()`.
 *
 * The shim and the body are one init script so the GM_* globals exist before
 * the body's first statement, on the first document and on every reload.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ file: string, grants?: string[], seed?: Record<string, unknown> }} options
 * @returns {Promise<{ file: string, meta: NonNullable<ReturnType<typeof parseMetadata>>, grants: string[] }>}
 */
async function injectAtStart(page, { file, grants, seed }) {
  const script = loadUserscript(file);
  const resolved = resolveGrants(script.meta, grants);
  assertSupportedGrants(resolved, script.file);

  await page.addInitScript({ content: buildContent({ grants: resolved, seed, body: script.body }) });

  return { file: script.file, meta: script.meta, grants: resolved };
}

/**
 * Inject a userscript after navigation, for `@run-at document-end`/`idle`
 * scripts and for tests that want the page to load first.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ file: string, grants?: string[], seed?: Record<string, unknown> }} options
 * @returns {Promise<{ file: string, meta: NonNullable<ReturnType<typeof parseMetadata>>, grants: string[] }>}
 */
async function injectAfterLoad(page, { file, grants, seed }) {
  const script = loadUserscript(file);
  const resolved = resolveGrants(script.meta, grants);
  assertSupportedGrants(resolved, script.file);

  await page.addScriptTag({ content: buildContent({ grants: resolved, seed, body: script.body }) });

  return { file: script.file, meta: script.meta, grants: resolved };
}

/**
 * Serve `html` for a URL, so tests use the host and path the banner declares
 * instead of a `file://` page no `@match` pattern would cover.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} html
 * @param {string | RegExp} urlPattern
 * @returns {Promise<void>}
 */
async function serveHtml(page, html, urlPattern) {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: html,
    }),
  );
}

module.exports = {
  GM_PREFIX,
  SUPPORTED_GRANTS,
  injectAfterLoad,
  injectAtStart,
  loadUserscript,
  matchUrl: matchesUrl,
  serveHtml,
};
