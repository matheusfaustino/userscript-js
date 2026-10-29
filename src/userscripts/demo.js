/**
 * Demo userscript.
 *
 * Exists to exercise the whole pipeline end to end: esbuild bundling with a
 * generated `==UserScript==` banner, the storage adapter on both backends, and
 * the Playwright harness. Replace it with real scripts; keep at least one
 * script here so the harness tests have something to run.
 */

const { createStore } = require('../storage.js');

const COUNT_KEY = 'userscript-js:demo-count';
const count = createStore(COUNT_KEY, 0);

function mount() {
  if (document.getElementById('userscript-js-demo')) return;

  const box = document.createElement('aside');
  box.id = 'userscript-js-demo';
  box.setAttribute('data-backend', typeof GM_getValue === 'function' ? 'gm' : 'local');

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '+1';

  const output = document.createElement('output');
  output.id = 'userscript-js-demo-count';

  let value = Number(count.get(0)) || 0;
  const render = () => {
    output.value = String(value);
    output.textContent = String(value);
  };

  const set = (next) => {
    value = next;
    count.set(value);
    render();
  };

  button.addEventListener('click', () => set(value + 1));

  render();
  box.append(button, output);
  document.body.append(box);

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Reset demo counter', () => set(0)); // eslint-disable-line no-undef
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
