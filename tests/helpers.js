// Shared test helpers: load a YAML config in node; serve the project over http for browser tests.
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');
['js/vendor/js-yaml.min.js', 'js/schema.js', 'js/runtime.js', 'js/engine.js'].forEach(f => require(path.join(ROOT, f)));
if (!globalThis.jsyaml) globalThis.jsyaml = require(path.join(ROOT, 'js/vendor/js-yaml.min.js'));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
function loadSpec(cfgPath, override) { return MF_RUNTIME.loadSync(override || read(cfgPath), cfgPath, read); }
function loadEngine(cfgPath) { return MF_ENGINE.createLocalEngine(loadSpec(cfgPath)); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.yaml': 'text/yaml', '.csv': 'text/csv' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res({ srv, base: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() }));
  });
}
// open the app and wait until it has rendered
async function openApp(p, url) { await p.goto(url); await p.waitForFunction(() => window.MF_APP && window.MF_APP.ready, null, { timeout: 15000 }); }
module.exports = { ROOT, read, loadSpec, loadEngine, serve, openApp };
