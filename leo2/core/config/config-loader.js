const fs = require('fs');
const path = require('path');

function tryLoad(p) {
  if (!p) return null;
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  const cfg = JSON.parse(raw);
  cfg.__loadedFrom = p;
  return cfg;
}

function loadLeoConfig() {
  const candidates = [
    process.env.LEO_CONFIG_FILE,                           // explicit
    path.resolve(process.cwd(), 'leo-config.json'),        // cwd
    path.resolve(process.cwd(), 'config/leo-config.json'), // cwd/config
    path.resolve(__dirname, '../../leo-config.json'),      // alongside code
  ];
  
  for (const p of candidates) {
    const cfg = tryLoad(p);
    if (cfg) {
      console.log('[CONFIG] loaded:', cfg.__loadedFrom);
      return cfg;
    }
  }
  throw new Error('CONFIG_NOT_FOUND: set LEO_CONFIG_FILE or add leo-config.json');
}

module.exports = { loadLeoConfig };
