# userscript-js

Build Tampermonkey-style userscripts with esbuild and test them in Playwright
without installing Tampermonkey.

The bundle in `dist/` is the file a user installs: one IIFE with a generated
`==UserScript==` banner. Tests inject that same file into a fixture page, so a
broken banner, a leftover `require`, or a storage regression fails in CI rather
than after a manual install.

## Why Tampermonkey is not loaded in tests

Driving the extension UI is slow and brittle. Chrome removed the flags that
sideload an unpacked extension, and an MV3 userscript still needs a manual
per-extension toggle, so a test run would depend on a pre-seeded profile that
nothing in the repo can reproduce reliably. The parts worth testing — matching,
storage, DOM behaviour — do not involve the manager at all.

Instead the built file is injected into a page whose URL matches the banner:

- `injectAtStart` registers one `addInitScript` containing the GM shim followed
  by the script body, so globals exist before the body's first statement and on
  every reload. Call it before `page.goto()`.
- `injectAfterLoad` uses `addScriptTag` for `@run-at document-end`/`idle`
  scripts, after navigation.
- `serveHtml` fulfils a route so tests use the real-looking URL the banner
  declares instead of `file://`.
- `grants` defaults to the banner's `@grant` lines. Pass `grants: []` to exercise
  the `localStorage` fallback, or a subset to prove a feature degrades.

The shim keeps GM values in `localStorage` under `__usj_gm:`, which is why state
survives `page.reload()`. It exposes `window.__userscriptTest` with `grants`,
`menuCommands`, `notifications`, `logs`, and `runMenuCommand(caption)`. Grants
the shim cannot honour throw at injection time; `GM_xmlhttpRequest` throws when
called rather than silently doing nothing.

## Layout

```
build.js               esbuild build for every target, optional --watch
userscript.config.js   targets: entry, outfile, metadata
src/meta.js            banner parse/serialize, @match/@include evaluation
src/storage.js         createStore(): GM_* -> localStorage -> memory
testing/index.js       Playwright injection harness and GM shim
tests/meta.spec.js     banner, pattern table, round-trip, demo @match
tests/demo.spec.js     widget, both storage backends, reload persistence
tests/fixtures/        pages a test serves at a matching URL
dist/                  build output (gitignored)
```

## Included scripts

- `demo` — a counter widget that proves both storage backends and reload
  persistence. Reuse `src/storage.js` the same way.
- `youtube-chapter-nav` — previous/next arrow buttons on the left and right
  edges of the YouTube player, styled with the player's own `ytp-button` class
  and 36px chevrons so they match the native controls. They have no background
  and fade in when the pointer is over the player, and they are only present on
  `/watch` pages — the feed and mini-player also contain a video element.
  Chapters are read from
  `ytd-app`'s page data (which YouTube refreshes on SPA navigation), falling
  back to `ytInitialData`, so navigation only appears on videos with authored
  or auto-generated chapters. At the first chapter, previous replays it from
  the start; at the last chapter, next jumps to the end of the video.
  `@grant none`.

## Userscript managers

The bundles install in Tampermonkey and Violentmonkey. This project uses
`@grant none` and, for Violentmonkey, `@inject-into page`: chapter data lives on
YouTube's page objects (`ytd-app.data`, `window.ytInitialData`), which a content
script cannot read. Keep Violentmonkey's injection mode on `page` (or `auto`);
if it is forced to `content`, the chapter buttons stay hidden.

`inject-into` is Violentmonkey-specific. Other managers ignore it, and with
`@grant none` they already run the script in page context.

Install from the built file in `dist/` — drag it onto the manager's dashboard or
paste its contents into a new script. The repository is private, so installing
from a raw GitHub URL needs authentication.

## Adding a userscript

1. Write `src/userscripts/<name>.js`. Use `createStore` from `src/storage.js`
   instead of calling `GM_getValue` directly; that is what makes the script work
   under Tampermonkey, an Electron custom-JS field, and the tests.
2. Add one entry to `userscript.config.js` with `entry`, `outfile`, and `meta`.
   The banner is generated from `meta` — never paste a `==UserScript==` block
   into the source file, or the installed version can drift from the config.
3. Add `tests/<name>.spec.js`: serve a fixture at a URL covered by `@match`,
   inject the built file, assert on the DOM. Use `grants: []` for a test that
   proves the fallback path.
4. `npm test` builds first, then runs both browser projects.

## Running

```sh
npm install
npm test            # build + chromium and firefox
npm run test:headed
npm run report      # open the last HTML report
npm run watch       # rebuild on change
```

Through Paseo, from the workspace (pass `--workspace <id>` if the cwd lookup
cannot resolve the workspace):

```sh
paseo script start test --workspace wks_22479f2c82256ddf
paseo script start report --workspace wks_22479f2c82256ddf
```

`test` runs the suite. `report` rebuilds, runs the suite with the HTML reporter,
then serves `playwright-report/` on `$PASEO_PORT`; `paseo script ls --workspace
<id>` prints the public proxy URL.

## Known limitations

- No real manager sandbox. GM_* semantics are the shim's, not Tampermonkey's:
  no sandboxed `window`, no `@require` loading, no update checks.
- `@include` is treated as a glob or `/regex/` literal. Other manager-specific
  include forms are not modelled.
- MV3 storage seeding is not implemented. GM values are seeded per test context
  in `localStorage`, not into an extension's storage area.
- `GM_xmlhttpRequest` is unstubbed: tests that need it must `page.route` the
  target and provide their own stub.
- `@resource`/`GM_getResourceText`, `GM_openInTab`, and other grants outside
  `SUPPORTED_GRANTS` in `testing/index.js` fail at injection time by design.
- Pages that enforce Trusted Types (YouTube does) reject
  `page.addScriptTag`, so `injectAfterLoad` cannot target the live site. Use
  `injectAtStart` or a fixture for those.
