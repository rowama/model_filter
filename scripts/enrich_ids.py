"""Native model-ID enrichment (2026-10-16).
Adds per-model access-path IDs for a 'provider_id:model' routing field:
  anthropicId, anthropicAlias, claudeCodeAlias, openaiId, geminiId, xaiId, deepseekId, cohereId  (+ prov for each)
  modelIds: ordered display map {path label: exact ID string} incl. OpenRouter (orid) and Hugging Face (hf).
Sources: ONLY the vendors' official public model docs, fetched with --fetch into raw/vendor_model_ids.json.
Matching is exact: an ID is assigned only when the catalog's OpenRouter slug (minus vendor prefix) equals a
documented ID/snapshot, or via the explicit, hand-reviewed NAME_MAP below. Nothing is constructed or guessed.
Usage: python3 scripts/enrich_ids.py --fetch   (refresh evidence, then apply)
       python3 scripts/enrich_ids.py           (apply from saved evidence)"""
import json, re, sys, os, datetime, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw', 'vendor_model_ids.json'); CAT = os.path.join(ROOT, 'data', 'catalog.json')
UA = {'User-Agent': 'Mozilla/5.0'}

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return r.read().decode('utf-8', 'ignore')
        except Exception:
            if i == tries - 1: raise
def text(h):
    import html as H
    h = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S)
    return re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', h)))

def fetch():
    today = datetime.date.today().isoformat(); ev = {'fetched': today, 'vendors': {}}
    # Anthropic: overview table (current) + each legacy model's overview page ("Claude API" row)
    base = 'https://platform.claude.com/docs/en/models/'
    ov = get(base + 'overview.md'); ids = {}
    hdr = next(l for l in ov.splitlines() if l.startswith('| Feature'))
    names = [c.strip() for c in hdr.strip('|').split('|')][1:]
    row = next(l for l in ov.splitlines() if l.startswith('| Claude API ID'))
    vals = re.findall(r'`([^`]+)`', row)
    for n, v in zip(names, vals): ids[n] = {'id': v, 'url': base + 'overview'}
    slugs = re.findall(r'\(https://platform\.claude\.com/docs/en/models/([a-z0-9-]+)/overview\)', ov.split('Legacy models')[1].split('\n')[0])
    slugs += [x for x in re.findall(r'/docs/en/models/((?:opus|sonnet|haiku|fable)-[0-9-]+)/overview', get(base + 'legacy-models')) if x not in slugs]
    for slug in dict.fromkeys(slugs):
        if not slug[-1].isdigit(): continue
        try: md = get(base + slug + '/overview.md')
        except Exception: continue
        title = re.search(r'^title: (.+)$', md, re.M).group(1).strip()
        m = re.search(r'^\| Claude API +\| `([^`]+)`', md, re.M); a = re.search(r'^\| Claude API alias +\| `([^`]+)`', md, re.M)
        if m: ids[title] = {'id': m.group(1), 'alias': a.group(1) if a else None, 'url': base + slug + '/overview'}
    ev['vendors']['anthropic'] = ids
    # Claude Code CLI aliases (Anthropic API column)
    cc = get('https://code.claude.com/docs/en/model-config.md'); al = {}
    r = re.search(r'^\| Anthropic API \| (.+?) \| (.+?) \| (.+?) \|', cc, re.M)
    for k, v in zip(['opus', 'sonnet', 'haiku'], r.groups()): al['Claude ' + v.strip()] = k
    f = re.search(r'the `fable` alias resolves to (Fable [0-9.]+)', cc)
    if f: al['Claude ' + f.group(1)] = 'fable'
    ev['vendors']['claude_code'] = {'aliases': al, 'url': 'https://code.claude.com/docs/en/model-config'}
    # OpenAI: catalog page -> each model page ("Model ID" + snapshot list)
    ob = 'https://developers.openai.com'; idx = get(ob + '/api/docs/models.md'); oa = {}
    for p in sorted(set(re.findall(r'\((/api/docs/models/[^)]+)\.md\)', idx))):
        md = get(ob + p + '.md'); m = re.search(r'Model ID: `([^`]+)`', md)
        if not m: continue
        sec = md.split('list of all available snapshots', 1)[1].split('\n## ', 1)[0] if 'list of all available snapshots' in md else ''
        snaps = re.findall(r'^- `([^`]+)`', sec, re.M)
        oa[m.group(1)] = {'title': md.splitlines()[0].lstrip('# ').strip(), 'snapshots': snaps, 'url': ob + p}
    ev['vendors']['openai'] = oa
    # Gemini: models page -> each model page ("Model code" + Versions)
    gb = 'https://ai.google.dev/gemini-api/docs/models'; gm = get(gb + '.md.txt'); gg = {}
    for u in sorted(set(re.findall(re.escape(gb) + r'/[a-z0-9.-]+', gm))):
        md = get(u + '.md.txt'); codes = set()
        mc = re.search(r'Model code \|([^\n]+)', md); vs = re.search(r'Versions \|([^\n]+)', md)
        for s in (mc, vs):
            if s: codes |= set(re.findall(r'`([a-z0-9.-]+)`', s.group(1)))
        for c in codes: gg[c] = {'url': u}
    for n, c in re.findall(r'Model Endpoint (Gemini [0-9.]+ \w+) ([a-z0-9.-]+)', text(get(gb))): gg.setdefault(c, {'url': gb, 'name': n})
    ev['vendors']['gemini'] = gg
    # xAI
    xm = get('https://docs.x.ai/developers/models.md')
    ev['vendors']['xai'] = {'ids': sorted(set(re.findall(r'^\| (grok-[a-z0-9.-]+)', xm, re.M))), 'url': 'https://docs.x.ai/developers/models'}
    # DeepSeek (model name -> model version table)
    dt = text(get('https://api-docs.deepseek.com/quick_start/pricing'))
    m = re.search(r'MODEL ([a-z0-9-]+) \(1\) ([a-z0-9-]+) BASE URL.*?MODEL VERSION (\S+) (\S+)', dt)
    ev['vendors']['deepseek'] = {'map': {m.group(3): m.group(1), m.group(4): m.group(2)}, 'url': 'https://api-docs.deepseek.com/quick_start/pricing'}
    # Cohere
    ct = text(get('https://docs.cohere.com/docs/models'))
    ev['vendors']['cohere'] = {'live': sorted(set(re.findall(r'((?:command|embed)-[a-z0-9.+-]+) Live', ct)) | ({'embed-v4.0'} if 'Embed embed-v4.0' in ct else set())), 'url': 'https://docs.cohere.com/docs/models'}
    json.dump(ev, open(RAW, 'w'), indent=1, sort_keys=True); return ev

# Hand-reviewed matches for records whose OpenRouter slug differs from the vendor ID (catalog id -> (field, documented ID)).
NAME_MAP = {
  'man:openai/whisper-1': ('openaiId', 'whisper-1'),
  'man:google/gemini-embedding-001': ('geminiId', 'gemini-embedding-001'),
  'man:google/gemini-embedding-2': ('geminiId', 'gemini-embedding-2'),
  'man:cohere/embed-v4': ('cohereId', 'embed-v4.0'),
}
LABELS = [('orid', 'OpenRouter'), ('hf', 'Hugging Face'), ('anthropicId', 'Anthropic API'), ('anthropicAlias', 'Anthropic API alias'), ('claudeCodeAlias', 'Claude Code CLI alias'),
          ('openaiId', 'OpenAI API'), ('geminiId', 'Gemini API'), ('xaiId', 'xAI API'), ('deepseekId', 'DeepSeek API'), ('cohereId', 'Cohere API')]

def apply(ev):
    d = json.load(open(CAT)); day = ev['fetched']; V = ev['vendors']; n = {}
    oa_ids = {}
    for k, v in V['openai'].items():
        oa_ids[k] = (k, v['url'])
        for s in v['snapshots']: oa_ids.setdefault(s, (s, v['url']))
    oa_titles = {v['title'].lower(): (k, v['url']) for k, v in V['openai'].items()}
    def put(r, f, val, url):
        r[f] = val; r.setdefault('prov', {})[f] = f'{url} (fetched {day})'; n[f] = n.get(f, 0) + 1
    for r in d['models']:
        for f, _ in LABELS[2:]: r.pop(f, None); r.get('prov', {}).pop(f, None)
        r.pop('modelIds', None)
        orid = r.get('orid') or ''; mk, _, slug = orid.partition('/'); slug = slug.split(':')[0]
        if mk == 'anthropic':
            a = V['anthropic'].get(r['name'])
            if a: put(r, 'anthropicId', a['id'], a['url'])
            if a and a.get('alias') and a['alias'] != a['id']: put(r, 'anthropicAlias', a['alias'], a['url'])
            al = V['claude_code']['aliases'].get(r['name'])
            if al: put(r, 'claudeCodeAlias', al, V['claude_code']['url'] + ' (Anthropic API)')
        elif mk == 'openai' and slug in oa_ids: put(r, 'openaiId', *oa_ids[slug])
        elif mk == 'openai' and oa_titles.get(r['name'].lower()): put(r, 'openaiId', *oa_titles[r['name'].lower()])
        elif not orid and r.get('maker') == 'openai' and r['name'] in V['openai']: put(r, 'openaiId', r['name'], V['openai'][r['name']]['url'])
        elif mk == 'google' and slug in V['gemini'] and not slug.startswith('gemma'): put(r, 'geminiId', slug, V['gemini'][slug]['url'])
        elif mk == 'x-ai':
            ids = V['xai']['ids']
            if slug in ids: put(r, 'xaiId', slug, V['xai']['url'])
            elif slug == 'grok-4.20-multi-agent' and 'grok-4.20-multi-agent-0309' in ids: put(r, 'xaiId', 'grok-4.20-multi-agent-0309', V['xai']['url'])
            elif slug == 'grok-4.20' and {'grok-4.20-0309-reasoning', 'grok-4.20-0309-non-reasoning'} <= set(ids):
                put(r, 'xaiId', 'grok-4.20-0309-reasoning | grok-4.20-0309-non-reasoning', V['xai']['url'])
        elif mk == 'deepseek' and r.get('hf'):
            ver = r['hf'].split('/')[-1]
            if ver in V['deepseek']['map']: put(r, 'deepseekId', V['deepseek']['map'][ver], V['deepseek']['url'])
        elif mk == 'cohere':
            m = re.match(r'^(command-r7b|command-r-plus|command-r)-(\d\d-\d{4})$', slug)
            cands = {'command-a': 'command-a-03-2025', 'command-a-plus': 'command-a-plus-05-2026'}
            cid = slug if m else cands.get(slug)
            if cid and cid in V['cohere']['live']: put(r, 'cohereId', cid, V['cohere']['url'])
        if r['id'] in NAME_MAP:
            f, val = NAME_MAP[r['id']]
            src = {'openaiId': lambda: V['openai'].get(val, {}).get('url'), 'geminiId': lambda: V['gemini'].get(val, {}).get('url'),
                   'cohereId': lambda: V['cohere']['url'] if val in V['cohere']['live'] else None}[f]()
            if src: put(r, f, val, src)
        mi = {lab: r[f] for f, lab in LABELS if r.get(f)}
        if mi: r['modelIds'] = mi
    open(CAT, 'w').write(json.dumps(d))
    return d, n

if __name__ == '__main__':
    ev = fetch() if '--fetch' in sys.argv else json.load(open(RAW))
    d, n = apply(ev)
    print(json.dumps(n, indent=1))
