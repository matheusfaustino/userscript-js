/**
 * Bundles every target in userscript.config.js into dist/.
 *
 * The banner is generated from the target's `meta` rather than pasted, so the
 * version a manager reports and the version in package.json cannot disagree.
 *
 * Usage:
 *   node build.js          single build
 *   node build.js --watch  rebuild on src/ changes
 */

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { serializeMetadata } = require('./src/meta.js');
const targets = require('./userscript.config.js');

const watch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  platform: 'browser',
  target: ['firefox57'],
  format: 'iife',
  logLevel: 'info',
};

async function build() {
  fs.rmSync('dist', { recursive: true, force: true });
  fs.mkdirSync('dist', { recursive: true });

  const contexts = targets.map((target) =>
    esbuild.context({
      ...sharedOptions,
      entryPoints: [target.entry],
      outfile: target.outfile,
      banner: { js: serializeMetadata(target.meta) },
    }),
  );

  const resolved = await Promise.all(contexts);

  if (watch) {
    await Promise.all(resolved.map((ctx) => ctx.watch()));
    console.log(`[userscript-js] watching ${targets.length} target(s)…`);
    return;
  }

  await Promise.all(resolved.map((ctx) => ctx.rebuild()));
  await Promise.all(resolved.map((ctx) => ctx.dispose()));

  for (const target of targets) {
    const { size } = fs.statSync(target.outfile);
    console.log(`[userscript-js] ${target.outfile} (${size} bytes)`);
  }
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
