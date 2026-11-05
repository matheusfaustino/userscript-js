# userscript-js

A small collection of userscripts that make YouTube a little nicer to use.

## Install

1. Install the [Violentmonkey](https://violentmonkey.github.io/get-it/) browser extension.
2. Open the script you want. Violentmonkey will ask you to confirm the install:
   - [YouTube thumbnail actions](https://github.com/matheusfaustino/userscript-js/releases/download/latest/youtube-thumbnail-actions.user.js)
   - [YouTube chapter nav](https://github.com/matheusfaustino/userscript-js/releases/download/latest/youtube-chapter-nav.user.js)
   - [YouTube speed control](https://github.com/matheusfaustino/userscript-js/releases/download/latest/youtube-speed-control.user.js)
3. That's it. Updates install the same way.

> [!NOTE]
> These scripts are made with Violentmonkey in mind and aren't tested in other
> managers, but they only use standard userscript features, so they should work
> elsewhere too.

## Scripts

Version history for each script lives in [CHANGELOG.md](CHANGELOG.md).

### YouTube thumbnail actions

Two buttons that appear when you hover a video thumbnail, on the home feed,
in search results, and in the watch-page sidebar.

- **⊘ Not interested**: runs the video's real "Not interested" feedback, the
  same as opening the card's menu and clicking it yourself.
- **🕓 Save to Watch later**: saves the video to your Watch later list
  through the card's real menu item.

They only show up on actual videos (no Shorts, ads, channels, or playlists),
never navigate away from the page, and fade in on hover so thumbnails look
untouched otherwise.

### YouTube chapter nav
Previous/next arrow buttons on the left and right edges of the YouTube player.
They only appear on videos that have chapters (authored or auto-generated) and
match the player's native controls. At the first chapter, previous replays the
video from the start; at the last chapter, next jumps to the end.

### YouTube speed control

A small chip in the corner of the player: slower, the current rate, faster.
The middle button toggles between 1x and your last rate, and your choice is
remembered across videos. The same controls work from the keyboard
(`+`, `-`, `*`) and from Shift plus the mouse wheel over the player. It stays
out of the way during ads.

## Developing

```sh
npm install
npm run build   # build every script into dist/
npm test        # build + run the test suite in real browsers
npm run watch   # rebuild on change
```

The installed file is the bundle in `dist/`: one self-contained `.user.js`
with a generated metadata banner. To try a local build, drag the file onto
Violentmonkey's dashboard.
