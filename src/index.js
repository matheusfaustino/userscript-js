/**
 * Package entry point. Re-exports the pieces usable at runtime inside a
 * bundled userscript; the metadata helpers are shared with the test harness.
 */

const { createStore } = require('./storage.js');
const meta = require('./meta.js');

module.exports = { createStore, ...meta };
