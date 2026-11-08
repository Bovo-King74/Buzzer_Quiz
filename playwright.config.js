const { defineConfig } = require('@playwright/test');
const port = Number(process.env.PW_PORT || 3150);
module.exports = defineConfig({
  testDir: './test',
  testMatch: 'menu-profile.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 6000 },
  reporter: [['list'], ['json', { outputFile: '.taste-skill/playwright/results.json' }]],
  outputDir: '.taste-skill/playwright/test-results',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } }],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    env: { PORT: String(port), HOST_PASS: 'PLAYWRIGHT', AFTERPARTY_ENABLED: 'false' },
    timeout: 15000
  }
});
