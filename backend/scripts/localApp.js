const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const settingsPath = path.join(root, '.env.local');
const actions = {
  up: ['up', '--build', '--detach', '--wait', '--wait-timeout', '180'],
  down: ['down'], // Keep the database volume and all local contributions.
  ps: ['ps'],
  logs: ['logs', '--tail', '80'],
  accounts: ['exec', '-T', 'app', 'node', 'scripts/provisionDemoUsers.js'],
  test: ['exec', '-T', 'app', 'node', 'tests/integration.workflow.js']
};
function initializeSettings(file = settingsPath) {
  if (fs.existsSync(file)) return false;
  const keys = ['DB_PASSWORD', 'JWT_SECRET', 'NORMAL_PASSWORD', 'EMPLOYEE_PASSWORD', 'ADMIN_PASSWORD'];
  const content = keys.map((key) => `SAPLE_LOCAL_${key}=${crypto.randomBytes(32).toString('hex')}`).join('\n');
  fs.writeFileSync(file, `${content}\n`, { flag: 'wx', mode: 0o600 });
  return true;
}
function main(action = process.argv[2]) {
  if (!actions[action]) throw new Error('Use local:up, local:down, local:status, local:logs, local:accounts, or local:test.');
  if (action === 'up') initializeSettings();
  if (!fs.existsSync(settingsPath)) throw new Error('Run npm run local:up first to create local settings.');
  const check = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (check.error || check.status !== 0) throw new Error('Start Docker Desktop (Linux containers), then run this command again.');
  const result = spawnSync('docker', ['compose', '--env-file', settingsPath, '-f', path.join(root, 'compose.local.yaml'), ...actions[action]],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Unable to launch Docker Compose. Check your Docker Desktop installation.');
  process.exitCode = result.status === 0 ? 0 : result.status || 1;
  if (action === 'up' && result.status === 0) console.log('Local Saple is ready at http://localhost:3000. This database contains independent demonstration data.');
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { initializeSettings, actions };
