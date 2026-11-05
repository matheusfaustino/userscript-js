/**
 * Declares which userscripts this project builds.
 *
 * Each target is bundled with esbuild and prefixed with a metadata block
 * generated from `meta`. Adding a userscript means adding an entry here.
 */

module.exports = [
  {
    // Video cards exist on the home feed, search results, and the watch-page
    // sidebar, and YouTube navigates between them without a reload.
    entry: 'src/userscripts/youtube-thumbnail-actions.js',
    outfile: 'dist/youtube-thumbnail-actions.user.js',
    meta: {
      name: 'YouTube thumbnail actions',
      namespace: 'https://github.com/matheusfaustino/userscript-js',
      version: '0.2.0',
      description:
        'Hover shortcuts on YouTube video thumbnails to run the card\'s real menu actions: Not interested and Save to Watch later.',
      author: 'Matheus Faustino',
      match: ['*://*.youtube.com/*'],
      grant: 'none',
      'run-at': 'document-end',
    },
  },
  {
    // The match covers every YouTube page because SPA navigation into a watch
    // page does not re-run the userscript; the script only mounts on /watch.
    entry: 'src/userscripts/youtube-chapter-nav.js',
    outfile: 'dist/youtube-chapter-nav.user.js',
    meta: {
      name: 'YouTube chapter navigation',
      namespace: 'https://github.com/matheusfaustino/userscript-js',
      version: '0.2.0',
      description: 'Previous/next chapter buttons on the left and right edges of the YouTube player.',
      author: 'Matheus Faustino',
      match: ['*://*.youtube.com/*'],
      grant: 'none',
      'run-at': 'document-end',
      // Violentmonkey-specific: keep the script in page context so YouTube's
      // page objects (ytd-app.data, ytInitialData) stay readable. The default
      // "auto" can fall back to a content script when CSP interferes.
      'inject-into': 'page',
    },
  },
  {
    // The chip belongs to whatever player is on screen, so the script mounts on
    // every YouTube surface that has one (watch, Shorts, embeds, miniplayer)
    // and only needs DOM access, not YouTube's page objects.
    entry: 'src/userscripts/youtube-speed-control.js',
    outfile: 'dist/youtube-speed-control.user.js',
    meta: {
      name: 'YouTube speed control',
      namespace: 'https://github.com/matheusfaustino/userscript-js',
      version: '0.1.0',
      description: 'Playback speed chip for the YouTube player with buttons, keys, and shift+wheel.',
      author: 'Matheus Faustino',
      match: ['*://*.youtube.com/*'],
      grant: [
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_registerMenuCommand',
      ],
      'run-at': 'document-end',
    },
  },
];
