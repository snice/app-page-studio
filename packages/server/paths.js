const path = require('path');

const SERVER_DIR = __dirname;
const WORKSPACE_ROOT = path.basename(path.dirname(SERVER_DIR)) === 'packages'
  ? path.resolve(SERVER_DIR, '..', '..')
  : SERVER_DIR;
const DATA_DIR = process.env.APP_PAGE_STUDIO_DATA_DIR
  ? path.resolve(process.env.APP_PAGE_STUDIO_DATA_DIR)
  : WORKSPACE_ROOT;

const CLIENT_DIST_DIRS = [
  path.join(WORKSPACE_ROOT, 'frontend_dist'),
  path.join(WORKSPACE_ROOT, 'packages', 'client', 'dist'),
  path.join(SERVER_DIR, 'frontend_dist'),
  path.join(SERVER_DIR, '..', 'client', 'dist'),
];

module.exports = {
  SERVER_DIR,
  WORKSPACE_ROOT,
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'studio.db'),
  HTML_CACHES_DIR: path.join(DATA_DIR, 'html_caches'),
  UI_IR_AGENT_SPEC_PATH: path.join(WORKSPACE_ROOT, 'UI-IR-AGENT.md'),
  CLIENT_DIST_DIRS,
};
