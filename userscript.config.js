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
];
