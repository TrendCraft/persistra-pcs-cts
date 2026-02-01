const fs = require('fs');
const path = require('path');

function loadConfig() {
  const root = path.resolve(__dirname, '../../'); // core/
  const candidates = [
    process.env.LEO_CONFIG_PATH,
    path.join(process.cwd(), 'leo-config.json'),
    path.join(root, '../leo-config.json'),       // repo root
    path.join(root, 'config/leo-config.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        cfg._loadedFrom = p;
        return cfg;
      }
    } catch (_) {}
  }
  return { _loadedFrom: 'defaults+env' };
}

module.exports = { loadConfig };
