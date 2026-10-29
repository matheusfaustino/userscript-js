/**
 * Userscript metadata parsing and @match evaluation.
 *
 * Both the build (banner generation) and the test harness (@match coverage)
 * read metadata through this module so the header a manager sees and the URLs
 * a test asserts against cannot drift apart.
 */

const BLOCK_RE = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/;
const LINE_RE = /^\s*\/\/\s*@(\S+)\s*(.*?)\s*$/;

const LIST_KEYS = new Set(['match', 'include', 'exclude', 'grant', 'require', 'resource', 'connect']);

// Header field order used when generating a banner. Fields not listed here are
// appended afterwards in the order they were supplied.
const ORDER = [
  'name',
  'namespace',
  'version',
  'description',
  'author',
  'homepageURL',
  'supportURL',
  'updateURL',
  'downloadURL',
  'icon',
  'match',
  'include',
  'exclude',
  'grant',
  'require',
  'connect',
  'run-at',
  'noframes',
];

/**
 * Parse the `==UserScript==` block of a userscript source file.
 *
 * @param {string} source
 * @returns {null | { raw: string, matches: string[], includes: string[], excludes: string[], grants: string[] }}
 */
function parseMetadata(source) {
  const block = BLOCK_RE.exec(source);
  if (!block) return null;

  const meta = {
    raw: block[0],
    matches: [],
    includes: [],
    excludes: [],
    grants: [],
  };

  for (const line of block[1].split(/\r?\n/)) {
    const parsed = LINE_RE.exec(line);
    if (!parsed) continue;

    const [, key, value] = parsed;
    if (key === 'match') meta.matches.push(value);
    else if (key === 'include') meta.includes.push(value);
    else if (key === 'exclude') meta.excludes.push(value);
    else if (key === 'grant') meta.grants.push(value);
    else meta[key] = value;
  }

  return meta;
}

/**
 * Remove the metadata block, leaving only executable code.
 *
 * @param {string} source
 * @returns {string}
 */
function stripMetadata(source) {
  return source.replace(BLOCK_RE, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a `@match` pattern to a RegExp.
 *
 * Chrome's match-pattern grammar: `<scheme>://<host><path>`, where scheme and
 * host may be `*`, host may start with `*.`, and path may contain `*`.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function matchPatternToRegExp(pattern) {
  if (pattern === '<all_urls>') return /^(?:https?|wss?|file|ftp):\/\//;

  const parts = /^(\*|https?|file|ftp|wss?):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!parts) throw new Error(`Invalid @match pattern: ${pattern}`);

  const [, scheme, host, path] = parts;
  const schemeRe = scheme === '*' ? 'https?' : escapeRegExp(scheme);

  let hostRe;
  if (host === '*') hostRe = '[^/]+';
  else if (host.startsWith('*.')) hostRe = `(?:[^/]+\\.)?${escapeRegExp(host.slice(2))}`;
  else hostRe = escapeRegExp(host);

  const pathRe = path.split('*').map(escapeRegExp).join('.*');

  return new RegExp(`^${schemeRe}:\\/\\/${hostRe}${pathRe}$`);
}

/**
 * Convert a `@include` glob to a RegExp.
 *
 * `@include` is loosely specified: Tampermonkey accepts globs and `/regex/`
 * literals. Only globs and regex literals are supported here; other managers
 * add behaviour this does not model.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function includeToRegExp(pattern) {
  if (pattern.length > 1 && pattern.startsWith('/') && pattern.endsWith('/')) {
    return new RegExp(pattern.slice(1, -1));
  }
  return new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
}

function anyMatch(patterns, convert, url) {
  return patterns.some((pattern) => convert(pattern).test(url));
}

/**
 * Decide whether a userscript with the given metadata runs on a URL.
 *
 * Mirrors the manager's precedence: `@exclude` wins, then `@match`, then
 * `@include`.
 *
 * @param {ReturnType<typeof parseMetadata>} meta
 * @param {string} url
 * @returns {boolean}
 */
function matchesUrl(meta, url) {
  if (!meta) return false;
  if (anyMatch(meta.excludes, includeToRegExp, url)) return false;
  if (anyMatch(meta.matches, matchPatternToRegExp, url)) return true;
  return anyMatch(meta.includes, includeToRegExp, url);
}

// parseMetadata returns the list fields under their plural names; accept both
// shapes so a parsed header can be serialized again without hand conversion.
const PLURAL_KEYS = { matches: 'match', includes: 'include', excludes: 'exclude', grants: 'grant' };

function normalizeMetadata(meta) {
  const normalized = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'raw' || value === undefined || value === null) continue;
    const target = PLURAL_KEYS[key] || key;
    const values = Array.isArray(value) ? value : [value];
    normalized[target] = [...(normalized[target] || []), ...values];
  }
  return normalized;
}

/**
 * Render metadata back into a `==UserScript==` block, newline terminated.
 *
 * @param {Record<string, string | string[] | number>} meta
 * @returns {string}
 */
function serializeMetadata(meta) {
  const fields = normalizeMetadata(meta);

  const keys = [...ORDER.filter((key) => fields[key] !== undefined)];
  for (const key of Object.keys(fields)) {
    if (!ORDER.includes(key)) keys.push(key);
  }

  const lines = ['// ==UserScript=='];
  for (const key of keys) {
    for (const value of fields[key]) {
      lines.push(`// @${key.padEnd(12)} ${value}`);
    }
  }
  lines.push('// ==/UserScript==');

  return `${lines.join('\n')}\n`;
}

module.exports = {
  LIST_KEYS,
  includeToRegExp,
  matchPatternToRegExp,
  matchesUrl,
  parseMetadata,
  serializeMetadata,
  stripMetadata,
};
