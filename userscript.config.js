/**
 * Declares which userscripts this project builds.
 *
 * Each target is bundled with esbuild and prefixed with a metadata block
 * generated from `meta`. Adding a userscript means adding an entry here.
 */

module.exports = [
  {
    entry: 'src/userscripts/demo.js',
    outfile: 'dist/demo.user.js',
    meta: {
      name: 'userscript-js demo',
      namespace: 'https://github.com/matheusfaustino/userscript-js',
      version: '0.1.0',
      description: 'Counter widget used to exercise the shared build and Playwright harness.',
      author: 'Matheus Faustino',
      match: ['*://*.userscript.test/demo/*'],
      grant: [
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_registerMenuCommand',
      ],
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
];
