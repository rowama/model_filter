#!/usr/bin/env python3
"""Builds data/catalog.js from raw/ snapshot files. No values are invented: missing -> null (shown 'unrated')."""
import json, glob, os, re, statistics, collections, datetime, sys
sys.path.insert(0, os.path.dirname(__file__)); import enrich
R = os.path.join(os.path.dirname(__file__), '..', 'raw'); OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
os.makedirs(OUT, exist_ok=True)
def jl(p):
    try: return json.load(open(p))
    except Exception: return None
def fn(i): return i.replace('/', '_').replace(':', '_')

HF_TYPES = {'text-generation': 'text', 'feature-extraction': 'embed', 'sentence-similarity': 'embed',
            'image-text-to-text': 'vision', 'text-to-image': 't2i', 'automatic-speech-recognition': 'stt', 'text-to-speech': 'tts'}
models = {}  # key -> record
def rec(key):
    if key not in models:
        models[key] = dict(id=key, name=key, maker=None, types=set(), weights=None, license=None, priceIn=None, priceOut=None,
                           comments=[], context=None, maxOut=None, params=None, speed=None, release=None, tools=None, json=None,
                           reasoning=None, inputMods=None, languages=None, localGPU=None, embedDim=None, desc='', sources=set(),
                           hf=None, orid=None, downloads=None, bench={}, prov={}, latency=None, aaIndex=None, aaIndexEstimated=None,
                           priceAudioMin=None, priceChars=None, paramsEstimated=False, jobsAnecdotal={})
    return models[key]

templates = {}
hfdetail = {}
for f in glob.glob(f'{R}/hfd/*.json'):
    d = jl(f)
    if d and 'id' in d: hfdetail[d['id']] = d
hfconf = {}
for f in glob.glob(f'{R}/hfc/*.json'):
    d = jl(f)
    if isinstance(d, dict): hfconf[os.path.basename(f)[:-5]] = d

LIC_MAP = {'apache-2.0': 'Apache-2.0', 'mit': 'MIT', 'bsd-3-clause': 'BSD', 'bsd': 'BSD', 'cc-by-4.0': 'CC-BY', 'cc-by-sa-4.0': 'CC-BY-SA',
           'cc-by-nc-4.0': 'CC-BY-NC', 'cc-by-nc-sa-4.0': 'CC-BY-NC', 'gpl-3.0': 'GPL', 'agpl-3.0': 'GPL', 'lgpl-3.0': 'GPL',
           'openrail': 'OpenRAIL', 'openrail++': 'OpenRAIL', 'creativeml-openrail-m': 'OpenRAIL', 'llama2': 'Llama community',
           'llama3': 'Llama community', 'llama3.1': 'Llama community', 'llama3.2': 'Llama community', 'llama3.3': 'Llama community',
           'llama4': 'Llama community', 'gemma': 'Gemma terms', 'other': 'Other/custom', 'unknown': None}
def norm_lic(l):
    if not l: return None
    if isinstance(l, list): l = l[0]
    l = str(l).lower()
    if l in LIC_MAP: return LIC_MAP[l]
    if l.startswith('cc-by-nc'): return 'CC-BY-NC'
    if l.startswith('llama'): return 'Llama community'
    if 'openrail' in l: return 'OpenRAIL'
    return 'Other/custom'

def apply_hf(r, hid):
    d = hfdetail.get(hid); r['hf'] = hid
    if not d: return
    card = d.get('cardData') or {}
    tags = d.get('tags') or []
    lic = card.get('license') or next((t[8:] for t in tags if t.startswith('license:')), None)
    r['license'] = r['license'] or norm_lic(lic)
    st = (d.get('safetensors') or {}).get('total')
    if st and not r['params']: r['params'] = round(st / 1e9, 3)
    langs = card.get('language')
    if isinstance(langs, str): langs = [langs]
    if langs and not r['languages']: r['languages'] = sorted(set(str(x).lower() for x in langs))
    if d.get('createdAt') and not r['release']: r['release'] = d['createdAt'][:10]
    c = hfconf.get(fn(hid)) or {}
    tc = c.get('text_config') if isinstance(c.get('text_config'), dict) else c
    mpe = tc.get('max_position_embeddings') or c.get('max_position_embeddings')
    if mpe and not r['context'] and isinstance(mpe, int) and mpe < 50_000_000: r['context'] = mpe
    r['_hidden'] = tc.get('hidden_size') or c.get('hidden_size') or c.get('d_model')
    r['_hfconfigtype'] = c.get('model_type')

# --- Hugging Face top-50 lists
for pt, ty in HF_TYPES.items():
    for i, m in enumerate(jl(f'{R}/hf_{pt}.json') or []):
        r = rec('hf:' + m['id']); r['types'].add(ty); r['name'] = m['id'].split('/')[-1]; r['maker'] = m['id'].split('/')[0]
        r['weights'] = 'Open'; r['sources'].add(f'HF top50 {pt}'); r['downloads'] = m.get('downloads')
        apply_hf(r, m['id'])
        tc = ((m.get('config') or {}).get('tokenizer_config') or {}).get('chat_template')
        if tc: templates[m['id']] = tc
        d = hfdetail.get(m['id']) or {}
        if pt == 'image-text-to-text': r['inputMods'] = ['image', 'text']
        elif pt in ('text-generation', 'feature-extraction', 'sentence-similarity', 'text-to-image', 'text-to-speech'): r['inputMods'] = r['inputMods'] or ['text']
        elif pt == 'automatic-speech-recognition': r['inputMods'] = ['audio']
        r['desc'] += ' ' + ' '.join(d.get('tags') or [])

# --- OpenRouter
ormods = jl(f'{R}/or_models.json')['data']
byid = {m['id']: m for m in ormods}
variants = collections.defaultdict(list)
skipped_alias = []
for m in ormods:
    i = m['id']
    if i.startswith('~'): skipped_alias.append(i); continue
    if re.search(r':(free|batch)$', i) and i.rsplit(':', 1)[0] in byid:
        variants[i.rsplit(':', 1)[0]].append(m); continue
    hid = m.get('hugging_face_id') or None
    key = 'hf:' + hid if hid and ('hf:' + hid) in models else 'or:' + i
    r = rec(key); r['orid'] = i; r['sources'].add('OpenRouter')
    r['name'] = re.sub(r'^[^:]+:\s*', '', m.get('name') or i); r['maker'] = i.split('/')[0]
    r['desc'] += ' ' + (m.get('description') or '')
    a = m.get('architecture') or {}
    ins = a.get('input_modalities') or []; outs = a.get('output_modalities') or []
    if 'text' in outs: r['types'].add('text')
    if 'text' in outs and 'image' in ins: r['types'].add('vision')
    if 'image' in outs: r['types'].add('t2i')
    if 'audio' in outs: r['types'].add('tts')
    if 'text' in outs and 'audio' in ins: r['types'].add('stt')
    if 'embeddings' in outs: r['types'].add('embed')
    r['inputMods'] = sorted(set(ins)) or r['inputMods']
    r['context'] = m.get('context_length') or r['context']
    r['maxOut'] = (m.get('top_provider') or {}).get('max_completion_tokens') or r['maxOut']
    sp = set(m.get('supported_parameters') or [])
    r['tools'] = 'tools' in sp; r['json'] = bool(sp & {'response_format', 'structured_outputs'}); r['reasoning'] = bool(sp & {'reasoning', 'include_reasoning'})
    if m.get('created'): r['release'] = datetime.datetime.utcfromtimestamp(m['created']).strftime('%Y-%m-%d')
    if hid:
        r['weights'] = 'Open'
        if r['hf'] is None: apply_hf(r, hid)
    else:
        r['weights'] = r['weights'] or 'Closed'
        if r['weights'] == 'Closed': r['license'] = 'Proprietary'
    # endpoints
    ep = jl(f'{R}/ep/{fn(i)}.json') or {}
    eps = (ep.get('data') or {}).get('endpoints') or []
    qi, qo, th = [], [], []
    for e in eps:
        p = e.get('pricing') or {}
        try:
            pi, po = float(p.get('prompt')) * 1e6, float(p.get('completion')) * 1e6
        except Exception: continue
        if pi < 0 or po < 0: continue
        qi.append((pi, e.get('provider_name'))); qo.append((po, e.get('provider_name')))
        if e.get('throughput_last_30m'): th.append(e['throughput_last_30m'])
        if e.get('max_completion_tokens') and not r['maxOut']: r['maxOut'] = e['max_completion_tokens']
    if not qi:
        p = m.get('pricing') or {}
        try:
            pi, po = float(p['prompt']) * 1e6, float(p['completion']) * 1e6
            if pi >= 0 and po >= 0: qi, qo = [(pi, 'OpenRouter list')], [(po, 'OpenRouter list')]
        except Exception: pass
    if qi:
        r['priceIn'] = round(statistics.median(x for x, _ in qi), 4); r['priceOut'] = round(statistics.median(x for x, _ in qo), 4)
        def rng(q, lab):
            lo = min(q); hi = max(q)
            return f"{lab}: cheapest {lo[1]} ${lo[0]:.3g}, priciest {hi[1]} ${hi[0]:.3g} (/1M, {len(q)} quotes)" if len(q) > 1 else f"{lab}: single quote {q[0][1]} ${q[0][0]:.3g}/1M"
        r['comments'] += [rng(qi, 'In'), rng(qo, 'Out')]
    if th: r['speed'] = round(statistics.median(th), 1)
    for v in variants.get(i, []):
        r['comments'].append(f"Variant {v['id'].split(':')[-1]} also listed (not in median)")

# --- manual frontier closed entries (prices from platform.openai.com/docs/pricing fetched on snapshot date)
MANUAL = [
 ('openai/text-embedding-3-small', 'text-embedding-3-small', 'openai', ['embed'], 0.02, None, 'Embedding priced input-only ($0.02/1M) per OpenAI pricing page; output n/a'),
 ('openai/text-embedding-3-large', 'text-embedding-3-large', 'openai', ['embed'], 0.13, None, 'Input-only $0.13/1M per OpenAI pricing page'),
 ('openai/text-embedding-ada-002', 'text-embedding-ada-002', 'openai', ['embed'], 0.10, None, 'Input-only $0.10/1M per OpenAI pricing page'),
 ('openai/gpt-4o-transcribe', 'gpt-4o-transcribe', 'openai', ['stt'], 2.50, 10.00, 'OpenAI pricing page; ~$0.006/min'),
 ('openai/gpt-4o-mini-transcribe', 'gpt-4o-mini-transcribe', 'openai', ['stt'], 1.25, 5.00, 'OpenAI pricing page; ~$0.003/min'),
 ('openai/whisper-1', 'Whisper (API)', 'openai', ['stt'], None, None, 'Priced per minute ($0.006/min), not per token -> unrated'),
 ('openai/gpt-4o-mini-tts', 'gpt-4o-mini-tts', 'openai', ['tts'], 0.60, 12.00, 'Text input $0.60/1M, audio output $12/1M (OpenAI pricing page)'),
 ('openai/tts-1-hd', 'tts-1-hd', 'openai', ['tts'], None, None, 'Priced $30/1M characters, not tokens -> unrated'),
 ('openai/gpt-image-2', 'gpt-image-2', 'openai', ['t2i'], 5.00, 30.00, 'Text input $5/1M, image output $30/1M (OpenAI pricing page)'),
 ('openai/gpt-image-1.5', 'gpt-image-1.5', 'openai', ['t2i'], 5.00, 32.00, 'Text input $5/1M, image output $32/1M (OpenAI pricing page)'),
 ('openai/gpt-image-1-mini', 'gpt-image-1-mini', 'openai', ['t2i'], 2.00, 8.00, 'Text input $2/1M, image output $8/1M (OpenAI pricing page)'),
 ('google/gemini-embedding-001', 'Gemini Embedding', 'google', ['embed'], None, None, 'Manual entry; pricing page not fetched'),
 ('cohere/embed-v4', 'Cohere Embed v4', 'cohere', ['embed'], None, None, 'Manual entry; pricing page not fetched'),
 ('elevenlabs/multilingual-v2', 'ElevenLabs Multilingual v2', 'elevenlabs', ['tts'], None, None, 'Manual entry; priced per character/credit, not fetched'),
 ('deepgram/nova-3', 'Deepgram Nova-3', 'deepgram', ['stt'], None, None, 'Manual entry; priced per minute, not fetched'),
 ('google/imagen-4', 'Imagen 4', 'google', ['t2i'], None, None, 'Manual entry; priced per image, not fetched'),
 ('midjourney/v7', 'Midjourney v7', 'midjourney', ['t2i'], None, None, 'Manual entry; subscription pricing, no API token price'),
]
for mid, name, mk, ty, pi, po, c in MANUAL:
    r = rec('man:' + mid); r.update(name=name, maker=mk, weights='Closed', license='Proprietary', priceIn=pi, priceOut=po)
    r['types'].update(ty); r['comments'].append(c); r['sources'].add('Manual (frontier closed)')
    r['inputMods'] = ['audio'] if 'stt' in ty else ['text']
    r['tools'] = None; r['localGPU'] = 'No (closed)'

# --- derived fields
for r in models.values():
    if 'embed' in r['types'] and r.get('_hidden'): r['embedDim'] = r['_hidden']
    if r['weights'] == 'Closed': r['localGPU'] = 'No (closed)'
    elif r['params']:
        p = r['params']; r['localGPU'] = 'Yes (<=14B)' if p <= 14 else ('High-end/quantized (14-40B)' if p <= 40 else 'No (>40B)')
    if r['types'] - {'text', 'vision'} and not r['types'] & {'text', 'vision'}:
        for k in ('tools', 'json', 'reasoning'): r[k] = None

# --- benchmarks
def nk(s):
    s = s.lower().split('/')[-1]
    s = re.sub(r'\(.*?\)', '', s)
    s = re.sub(r'\b(20\d{2}-?\d{2}-?\d{2})\b', '', s)
    return re.sub(r'[^a-z0-9.]', '', s).replace('.', '')
SUFFIX = ['thinking', 'high', 'medium', 'low', 'preview', 'latest', 'exp', 'instruct', 'chat', 'it', 'xhigh', 'max', 'nothinking']
def variants_of(s):
    k = nk(s); out = {k}
    changed = True
    while changed:
        changed = False
        for suf in SUFFIX:
            for kk in list(out):
                if kk.endswith(suf) and len(kk) > len(suf) + 2 and kk[:-len(suf)] not in out: out.add(kk[:-len(suf)]); changed = True
    return out
index = collections.defaultdict(set)
for key, r in models.items():
    names = {r['name'], r['id'].split(':', 1)[-1]}
    if r['orid']: names.add(r['orid'])
    if r['hf']: names.add(r['hf'])
    for n in names:
        for v in variants_of(n): index[v].add(key)
bench_src = {}
def assign(bench, name, val):
    if val is None: return 0
    hits = set()
    for v in variants_of(name): hits |= index.get(v, set())
    for k in hits:
        b = models[k]['bench']; b[bench] = max(b.get(bench, -1e9), val)
    return len(hits)
# LMArena
arena_date = None
for cfg, bname in [('text', 'arena_text'), ('webdev', 'arena_webdev'), ('vision', 'arena_vision'), ('text_to_image', 'arena_t2i')]:
    rows = []
    for f in glob.glob(f'{R}/arena/{cfg}_[0-9]*.json'):
        rows += [x['row'] for x in (jl(f) or {}).get('rows', [])]
    n = 0
    for x in rows:
        if x.get('category') in ('overall', 'webdev') and (cfg != 'webdev' or x.get('category') == 'webdev' or x.get('category') == 'overall'):
            if x.get('category') != 'overall': continue
            n += assign(bname, x['model_name'], x['rating']) > 0; arena_date = x.get('leaderboard_publish_date')
    bench_src[bname] = n
# Open LLM Leaderboard (archived) - exact HF id match only
oll = {}
for f in glob.glob(f'{R}/oll/*.json'):
    for x in (jl(f) or {}).get('rows', []):
        x = x['row']; oll[x['fullname']] = x
for bname, col in [('oll_ifeval', 'IFEval'), ('oll_bbh', 'BBH'), ('oll_math', 'MATH Lvl 5'), ('oll_gpqa', 'GPQA'), ('oll_musr', 'MUSR'), ('oll_mmlupro', 'MMLU-PRO')]:
    n = 0
    for r in models.values():
        if r['hf'] and r['hf'] in oll and oll[r['hf']].get(col) is not None:
            r['bench'][bname] = oll[r['hf']][col]; n += 1
    bench_src[bname] = n
# SWE-bench Verified
swe = jl(f'{R}/swe.json')
n = 0
for lb in swe['leaderboards']:
    if lb['name'] != 'Verified': continue
    for x in lb['results']:
        for t in x.get('tags', []):
            if t.startswith('Model: '): n += assign('swe_verified', t[7:], x.get('resolved')) > 0
bench_src['swe_verified'] = n
# Aider polyglot
import yaml
n = 0
for x in yaml.safe_load(open(f'{R}/aider.yml')):
    c = x.get('pass_rate_2'); hit = assign('aider_polyglot', str(x.get('model', '')), c)
    m = re.search(r'--model\s+(\S+)', x.get('command', ''))
    if m: hit += assign('aider_polyglot', m.group(1), c)
    n += hit > 0
bench_src['aider_polyglot'] = n
# LiveCodeBench
lcb = collections.defaultdict(list)
for x in jl(f'{R}/lcb.json')['performances']: lcb[x['model']].append(x['pass@1'])
n = 0
for mname, v in lcb.items(): n += assign('livecodebench', mname, sum(v) / len(v)) > 0
bench_src['livecodebench'] = n

ENRICH_STATS = enrich.run(models, R, rec, assign, variants_of, index, templates)
BENCH_GROUPS = {
  'aptCoding': ['swe_verified', 'aider_polyglot', 'livecodebench', 'arena_webdev', 'aa_terminalbenchHard', 'aa_scicode'],
  'aptReasoning': ['oll_gpqa', 'oll_math', 'oll_mmlupro', 'oll_bbh', 'oll_musr', 'aa_gpqa', 'aa_hle'],
  'aptWriting': ['arena_text'],
  'aptInstruct': ['oll_ifeval', 'aa_ifbench'],
  'aptAgents': ['swe_verified', 'aa_tau2', 'aa_terminalbenchHard'],
  'aptVision': ['arena_vision', 'aa_mmmuPro'],
  'aptEmbedding': ['mteb_eng14'],
  'aptSTT': ['asr_neg_wer'],
  'aptTTS': ['tts_arena_elo'],
  'aptImageGen': ['arena_t2i'],
}
TEXTB = ['swe_verified', 'aider_polyglot', 'livecodebench', 'arena_webdev', 'arena_text', 'oll_gpqa', 'oll_math', 'oll_mmlupro', 'oll_bbh', 'oll_musr', 'oll_ifeval', 'arena_vision', 'aa_gpqa', 'aa_hle', 'aa_tau2', 'aa_terminalbenchHard', 'aa_ifbench', 'aa_scicode', 'aa_lcr', 'aa_mmmuPro']
allb = sorted({b for r in models.values() for b in r['bench']})
pct = collections.defaultdict(dict)
for b in allb:
    vals = [(r['bench'][b], k) for k, r in models.items() if b in r['bench']]
    xs = [v for v, _ in vals]
    for v, k in vals:
        below = sum(1 for y in xs if y < v); eq = sum(1 for y in xs if y == v)
        pct[k][b] = 100 * (below + 0.5 * eq) / len(xs)
for k, r in models.items():
    p = pct.get(k, {})
    for a, bs in BENCH_GROUPS.items():
        v = [p[b] for b in bs if b in p]; r[a] = round(sum(v) / len(v), 1) if v else None
    v = [p[b] for b in TEXTB if b in p]; r['intelligence'] = round(sum(v) / len(v), 1) if v else None
    r['benchPct'] = {b: round(p[b], 1) for b in p}
    for a, bs in list(BENCH_GROUPS.items()) + [('intelligence', TEXTB)]:
        used = [b for b in bs if b in p]
        if used: r['prov'][a] = 'mean percentile of ' + ', '.join(used)
    r['benchRaw'] = {b: round(x, 2) for b, x in r['bench'].items()}

# --- job tags (heuristic, documented in SPEC.md)
JOBRULES = [
 ('coding.create', r'\bcod(e|er|ing|ex)\b|programming|software engineer|devstral|codestral'),
 ('coding.refactor', r'refactor'), ('coding.review', r'code review|reviewing code'), ('coding.debug', r'debug|bug fix|fix bugs'),
 ('coding.test', r'unit test|test generation|writing tests'), ('coding.web', r'frontend|web dev|webdev|html|react'),
 ('writing.creative', r'creative writing|storytelling|fiction|story'), ('writing.roleplay', r'roleplay|role-play|\brp\b|character'),
 ('writing.business', r'business writing|copywriting|marketing|email'), ('writing.summarize', r'summari'),
 ('reasoning.math', r'\bmath'), ('reasoning.logic', r'reasoning|logic|thinking'), ('reasoning.science', r'scien|stem|research'),
 ('extraction.json', r'structured output|json|extraction'), ('extraction.docs', r'\bocr\b|document|pdf|parsing'), ('extraction.classify', r'classif|tagging'),
 ('agents.functions', r'function calling|tool use|tool calling|tools'), ('agents.workflows', r'agentic|agent'), ('agents.computer', r'computer use|browser'),
 ('chat.assistant', r'\bchat|assistant|conversational|instruct'), ('chat.support', r'customer (support|service)'),
 ('translation.general', r'translat|multilingual'),
 ('retrieval.search', r'retriev|semantic search|\brag\b|embedding|sentence-similarity'), ('retrieval.rerank', r'rerank'), ('retrieval.cluster', r'cluster'),
 ('vision.describe', r'image understanding|caption|vision|image-text-to-text|multimodal'), ('vision.charts', r'chart|diagram'), ('vision.ocr', r'\bocr\b'), ('vision.video', r'video'),
 ('imagegen.photo', r'photoreal|text-to-image|diffusion|image generation'), ('imagegen.edit', r'image edit|inpaint'),
 ('speech.transcribe', r'speech recognition|transcri|automatic-speech-recognition|whisper|asr'), ('speech.synthesis', r'text-to-speech|\btts\b|speech synthesis'),
 ('speech.clone', r'voice clon'),
]
for r in models.values():
    t = (r['name'] + ' ' + r['desc'] + ' ' + (r['orid'] or '') + ' ' + (r['hf'] or '')).lower()
    tags = set(j for j, rx in JOBRULES if re.search(rx, t))
    ty = r['types']
    if 'embed' in ty: tags.add('retrieval.search')
    if 't2i' in ty: tags.add('imagegen.photo')
    if 'stt' in ty and not ty & {'text'}: tags.add('speech.transcribe')
    if 'tts' in ty: tags.add('speech.synthesis')
    if 'vision' in ty: tags.add('vision.describe')
    if r['tools']: tags.add('agents.functions')
    if r['json']: tags.add('extraction.json')
    if r['reasoning']: tags.add('reasoning.logic')
    if r.get('aptCoding') is not None: tags.add('coding.create')
    if 'text' in ty and not tags & {j for j in tags if j.startswith('chat')}: tags.add('chat.assistant')
    # domain sanity: drop tags impossible for the model type
    if not ty & {'text', 'vision'}: tags = {x for x in tags if x.split('.')[0] in {'retrieval', 'imagegen', 'speech'}}
    if 'embed' in ty and not ty & {'text', 'vision'}: tags = {x for x in tags if x.startswith('retrieval')}
    r['jobs'] = sorted(tags); r['_heurJobs'] = set(tags)
AVAIL_STATS = enrich.availability(models, R)
COMM_STATS = enrich.community(models, R, json.load(open(f'{R}/community_targets.json')))
for r in models.values():
    r['jobs'] = sorted(set(r['jobs']) | set(r['jobsAnecdotal']))  # anecdotal tags count as tagged; flagged via jobsAnecdotal
    r['jobsAnecdotalOnly'] = sorted(set(r['jobsAnecdotal']) - set(r['_heurJobs'])) if r['jobsAnecdotal'] else []

out = []
for k, r in models.items():
    if not r['types']: continue
    o = {f: r[f] for f in ['id', 'name', 'maker', 'weights', 'license', 'priceIn', 'priceOut', 'intelligence', 'context', 'maxOut', 'params', 'speed',
                           'release', 'tools', 'json', 'reasoning', 'inputMods', 'languages', 'localGPU', 'embedDim', 'jobs',
                           'aptCoding', 'aptReasoning', 'aptWriting', 'aptInstruct', 'aptAgents', 'aptVision', 'aptImageGen', 'benchRaw', 'benchPct', 'hf', 'orid', 'aptEmbedding', 'aptSTT', 'aptTTS', 'latency', 'aaIndex', 'aaIndexEstimated', 'priceAudioMin', 'priceChars', 'paramsEstimated', 'prov', 'jobsAnecdotal', 'jobsAnecdotalOnly', 'availableFrom']}
    o['types'] = sorted(r['types']); o['sources'] = sorted(r['sources']); o['comments'] = '; '.join(r['comments'])
    out.append(o)
snap = '2026-10-14'
meta = dict(snapshotDate=snap, enrichDate='2026-10-15', enrichStats=ENRICH_STATS, communityStats=COMM_STATS, availabilityStats=AVAIL_STATS, arenaPublishDate=arena_date, counts=collections.Counter(t for o in out for t in o['types']), total=len(out),
            benchMatches=bench_src, skippedAliases=skipped_alias)
open(f'{OUT}/catalog.js', 'w').write('(typeof window !== "undefined" ? window : globalThis).CATALOG = ' + json.dumps({'meta': meta, 'models': out}) + ';\n')
json.dump({'meta': meta, 'models': out}, open(f'{OUT}/catalog.json', 'w'))
print(json.dumps(meta, indent=1, default=str))
for f in ['priceIn', 'intelligence', 'context', 'params', 'speed', 'license', 'languages', 'embedDim', 'aptCoding', 'aptReasoning', 'aptWriting', 'aptVision', 'aptImageGen']:
    print(f, sum(1 for o in out if o[f] is not None))
