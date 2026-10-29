/**
 * Persistent key/value storage for userscripts.
 *
 * `GM_*` is used when the manager grants it; otherwise `localStorage`. Both
 * backends hold JSON text so a value written under Tampermonkey reads back
 * after the same script is injected somewhere without GM_* — an Electron
 * "custom JS" field, a Playwright test, or a plain `<script>` tag.
 *
 * Values are JSON-serialised rather than stored natively because managers
 * disagree on GM_getValue's coercion and localStorage is string-only.
 */

const PROBE_KEY = '__userscript_js_probe__';

function gmAvailable() {
  return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
}

/** localStorage throws outright in sandboxed frames and some file:// contexts. */
function localStorageAvailable() {
  try {
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

const memory = new Map();

function readRaw(key) {
  if (gmAvailable()) return GM_getValue(key, null); // eslint-disable-line no-undef
  if (localStorageAvailable()) return localStorage.getItem(key);
  return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
  if (gmAvailable()) {
    GM_setValue(key, value); // eslint-disable-line no-undef
  } else if (localStorageAvailable()) {
    localStorage.setItem(key, value);
  } else {
    memory.set(key, value);
  }
}

function removeRaw(key) {
  if (gmAvailable()) {
    if (typeof GM_deleteValue === 'function') GM_deleteValue(key); // eslint-disable-line no-undef
    else GM_setValue(key, null); // eslint-disable-line no-undef
  } else if (localStorageAvailable()) {
    localStorage.removeItem(key);
  } else {
    memory.delete(key);
  }
}

/**
 * Create a store bound to one key.
 *
 * @param {string} key
 * @param {*} [defaultValue] returned by get() before anything is written
 * @returns {{ get: (fallback?: *) => *, set: (value: *) => void, remove: () => void, key: string }}
 */
function createStore(key, defaultValue) {
  return {
    key,
    get(fallback = defaultValue) {
      const raw = readRaw(key);
      if (raw === null || raw === undefined) return fallback;
      if (typeof raw !== 'string') return raw;
      try {
        return JSON.parse(raw);
      } catch (error) {
        // A value written by another tool as plain text; return it verbatim
        // rather than discarding the user's data.
        return raw;
      }
    },
    set(value) {
      writeRaw(key, JSON.stringify(value));
    },
    remove() {
      removeRaw(key);
    },
  };
}

module.exports = { createStore };
