"use strict";
// The November 6 audit asserted known failures. Keep its entry point useful
// after those defects have been fixed: run acceptance regressions instead.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
console.log('Historical audit superseded: running realtime and security regressions.');
const result = spawnSync(process.execPath, ['--test', 'test/realtime.test.js', 'test/security-regressions.test.js'], {
  cwd: path.join(__dirname, '..'), stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
