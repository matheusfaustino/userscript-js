# Changelog

Each script is versioned on its own with `MAJOR.MINOR.PATCH` in
`userscript.config.js`, which becomes the `@version` Violentmonkey sees:

- `MAJOR` — a change that alters what the script does with your data or where
  it runs (new permissions, new sites, removed features).
- `MINOR` — a new feature or button.
- `PATCH` — a fix or a behavior correction with no new surface.

Every shipped change bumps the version, because Violentmonkey only offers an
update when `@version` moves.

## YouTube thumbnail actions

### 0.2.0 — 2026-11-05

- Added a second hover button, Save to Watch later, stacked below the
  Not interested button. Both stay inside small sidebar thumbnails.
- Renamed the script from "YouTube not interested shortcut" to cover both
  actions. This rename needs one manual reinstall; updates resume after that.

### 0.1.0 — 2026-11-05

- First release: a Not interested hover button on video thumbnails that runs
  the card's real menu item. Videos only — no Shorts, ads, channels, or
  playlists.

## YouTube chapter navigation

### 0.2.0 — 2026-10-29

- Runs in page context so it can read YouTube's own chapter data.
- Limited to watch pages, and arrows styled to match the native controls.

### 0.1.0 — 2026-10-29

- First release: previous/next chapter buttons on the player edges.

## YouTube speed control

### 0.1.0 — 2026-11-05

- First release: a speed chip on the player with slower/faster buttons, a 1x
  toggle, keyboard shortcuts, Shift+wheel control, and a remembered rate.
  Hidden while ads play.
