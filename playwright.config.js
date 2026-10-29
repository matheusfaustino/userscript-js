/**
 * Runs the fixture specs against both engines a userscript has to survive.
 * Chromium's shim-free run and Firefox's stricter init-script ordering are
 * different enough that a single-project suite hides bugs.
 */

module.exports = {
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
};
