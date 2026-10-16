# Build dist/model-filter.html: one self-contained file (CSS, JS, YAML parser, models.yaml + its dataset embedded).
# Usage: python3 scripts/build_single.py [config.yaml] [out.html]
import re, os, sys, json
R = os.path.join(os.path.dirname(__file__), '..'); os.makedirs(f'{R}/dist', exist_ok=True)
cfg = sys.argv[1] if len(sys.argv) > 1 else 'models.yaml'
out = sys.argv[2] if len(sys.argv) > 2 else f'{R}/dist/model-filter.html'
h = open(f'{R}/index.html', encoding='utf-8').read()
css = open(f'{R}/css/style.css', encoding='utf-8').read()
h = h.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
h = re.sub(r'<meta name="mf-default-config"[^>]*>\n?', '', h)
# embed the config and every file it references (dataset + taxonomy paths), keyed by path relative to the config's dir
node = f"""require('{R}/tests/helpers.js'); const fs=require('fs'); const cfg=MF_RUNTIME.parseConfig(fs.readFileSync('{R}/{cfg}','utf8'),'{cfg}');
console.log(JSON.stringify(MF_RUNTIME.neededFiles(cfg,'{cfg}')))"""
import subprocess
need = json.loads(subprocess.run(['node', '-e', node.replace(chr(10), ' ')], capture_output=True, text=True, check=True).stdout)
files = {cfg: open(f'{R}/{cfg}', encoding='utf-8').read()}
for p in need: files[p] = open(f'{R}/{p}', encoding='utf-8').read()
embed = 'window.MF_EMBED = ' + json.dumps({'config': cfg, 'files': files}, ensure_ascii=False) + ';'
def inl(m):
    s = open(f'{R}/' + m.group(1), encoding='utf-8').read()
    return '<script>\n' + s.replace('</', '<\\/') + '\n</script>'
h = re.sub(r'<script src="([^"]+)"></script>', inl, h)
h = h.replace('<script>\n', '<script>\n' + embed.replace('</', '<\\/') + '\n</script>\n<script>\n', 1)
open(out, 'w', encoding='utf-8').write(h)
print(out, os.path.getsize(out), 'embedded:', list(files))
