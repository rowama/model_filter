#!/usr/bin/env python3
"""Build candidate 'Find it here' URLs from real IDs in data/catalog.json and verify each by HTTP fetch.
Writes raw/link_check.json. Patterns whose verification fails broadly are dropped by enrich.links()."""
import json, os, re, concurrent.futures as cf, urllib.request, urllib.error, datetime
R = os.path.join(os.path.dirname(__file__), '..')
cat = json.load(open(f'{R}/data/catalog.json'))['models']
hfp = json.load(open(f'{R}/raw/hf_providers.json'))['models']
def tail(m): return (m.get('orid') or m['id'].split(':', 1)[-1]).split('/')[-1].split(':')[0]
cands = []  # (pattern, model id, url)
for m in cat:
    if m.get('orid'): cands.append(('openrouter', m['id'], f"https://openrouter.ai/{m['orid']}"))
    if m.get('hf'): cands.append(('huggingface', m['id'], f"https://huggingface.co/{m['hf']}"))
    mk = (m.get('maker') or '').lower()
    if mk == 'openai' and not m.get('hf'): cands.append(('openai-docs', m['id'], f"https://developers.openai.com/api/docs/models/{tail(m)}"))
    if mk == 'google' and not m.get('hf'): cands.append(('google-ai-docs', m['id'], f"https://ai.google.dev/gemini-api/docs/models/{tail(m)}"))
    if mk == 'mistralai' and m.get('orid'): cands.append(('mistral-docs', m['id'], f"https://docs.mistral.ai/models/{tail(m)}"))
    live = hfp.get(m.get('hf') or '', [])
    if 'featherless-ai' in live: cands.append(('featherless', m['id'], f"https://featherless.ai/models/{m['hf']}"))
    if 'deepinfra' in live: cands.append(('deepinfra', m['id'], f"https://deepinfra.com/{m['hf']}"))
    if 'together' in live: cands.append(('together', m['id'], f"https://www.together.ai/models/{m['hf'].split('/')[-1].lower()}"))
def check(c):
    pat, mid, url = c
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (model-filter link check)'})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(400000).decode('utf-8', 'ignore'); code = r.status
    except urllib.error.HTTPError as e: return url, {'pattern': pat, 'status': e.code, 'ok': False}
    except Exception as e: return url, {'pattern': pat, 'status': None, 'ok': False, 'error': str(e)[:80]}
    ok = code == 200
    if pat == 'openrouter':  # soft-404: unknown ids still return 200 with generic <title>OpenRouter</title>
        t = re.search(r'<title>([^<]*)</title>', body); ok = ok and bool(t) and t.group(1).strip() != 'OpenRouter'
    return url, {'pattern': pat, 'status': code, 'ok': ok}
out = {}
with cf.ThreadPoolExecutor(16) as ex:
    for url, res in ex.map(check, cands): out[url] = res
json.dump({'checked': datetime.date.today().isoformat(), 'note': 'GET with UA; ok=HTTP 200 (+ title check for OpenRouter soft-404s)',
           'candidates': [{'pattern': p, 'id': i, 'url': u} for p, i, u in cands], 'results': out}, open(f'{R}/raw/link_check.json', 'w'), indent=0)
import collections
c = collections.Counter((v['pattern'], v['ok']) for v in out.values())
for p in sorted({k[0] for k in c}): print(p, 'ok', c[(p, True)], 'fail', c[(p, False)])
