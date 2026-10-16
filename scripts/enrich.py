"""Enrichment stage (2026-10-15). Called from build_data.py. Every filled value records provenance in r['prov'][field].
Nothing here invents values: each fill comes from a fetched file in raw/ or a vendor page fetched on the enrichment date."""
import json, glob, os, re, statistics, csv, collections

def setp(r, field, value, src, overwrite=False):
    if value is None: return False
    if r.get(field) is not None and not overwrite: return False
    r[field] = value; r.setdefault('prov', {})[field] = src; return True

# ---------- vendor pricing (non-token units kept in their own dims) ----------
VENDOR = {
  # catalog id: dict(fields, comment)
  'man:openai/whisper-1': dict(priceAudioMin=0.006, src='platform.openai.com/docs/pricing (Whisper $0.006/min)'),
  'man:openai/gpt-4o-transcribe': dict(priceAudioMin=0.006, src='platform.openai.com/docs/pricing (est. $0.006/min)'),
  'man:openai/gpt-4o-mini-transcribe': dict(priceAudioMin=0.003, src='platform.openai.com/docs/pricing (est. $0.003/min)'),
  'man:openai/tts-1-hd': dict(priceChars=30.0, src='platform.openai.com/docs/pricing ($30/1M characters)'),
  'man:deepgram/nova-3': dict(priceAudioMin=0.0048, src='deepgram.com/pricing (Nova-3 Monolingual, current $0.0048/min; regular $0.0077/min)'),
}
VENDOR_COMMENTS = {
  'man:google/gemini-embedding-001': 'ai.google.dev pricing page (2026-10-15) lists only gemini-embedding-2, not -001: price left unrated',
  'man:google/imagen-4': 'Imagen is not listed on ai.google.dev Gemini API pricing page (2026-10-15): price unrated',
  'man:cohere/embed-v4': 'cohere.com/pricing shows no machine-readable Embed v4 price: unrated',
  'man:elevenlabs/multilingual-v2': 'elevenlabs.io/pricing/api lists v4/v3 ($0.04–0.08/1K chars) but not Multilingual v2: unrated',
  'man:midjourney/v7': 'No public per-token/per-image API price',
}
NEW_MANUAL = [  # (id, name, maker, types, priceIn, comment, src)
  ('man:google/gemini-embedding-2', 'Gemini Embedding 2', 'google', ['embed'], 0.20, 'Text input $0.20/1M (image $0.45/1M, audio $6.50/1M) per ai.google.dev pricing', 'ai.google.dev/gemini-api/docs/pricing'),
  ('man:elevenlabs/v3', 'ElevenLabs v3', 'elevenlabs', ['tts'], None, '$0.08 per 1K characters (elevenlabs.io/pricing/api)', 'elevenlabs.io/pricing/api'),
  ('man:elevenlabs/v4-turbo', 'ElevenLabs v4 Turbo', 'elevenlabs', ['tts'], None, '$0.04 per 1K characters (elevenlabs.io/pricing/api)', 'elevenlabs.io/pricing/api'),
]
NEW_CHARS = {'man:elevenlabs/v3': 80.0, 'man:elevenlabs/v4-turbo': 40.0}

# ---------- closed-model parameter estimates: only credible published estimates; none found ----------
PARAM_ESTIMATES = {}  # id -> (paramsB, source_url). Left empty on purpose: no credible published estimates found for catalog closed models.

TTS_ALIASES = {'Kokoro v1.0': ['hf:hexgrad/Kokoro-82M'], 'Chatterbox': ['hf:ResembleAI/chatterbox'], 'Eleven Multilingual v2': ['man:elevenlabs/multilingual-v2'], 'Eleven v3': ['man:elevenlabs/v3']}
MTEB_ALIASES = {'openai/text-embedding-3-small': 'man:openai/text-embedding-3-small', 'openai/text-embedding-3-large': 'man:openai/text-embedding-3-large',
                'openai/text-embedding-ada-002': 'man:openai/text-embedding-ada-002', 'google/gemini-embedding-001': 'man:google/gemini-embedding-001', 'Cohere/Cohere-embed-v4.0': 'man:cohere/embed-v4'}

def base_prov(models):
    BASE = ['maker', 'weights', 'license', 'priceIn', 'priceOut', 'context', 'maxOut', 'params', 'speed', 'release', 'tools', 'json', 'reasoning', 'inputMods', 'languages', 'embedDim']
    for k, r in models.items():
        for f in BASE:
            if r.get(f) is None or f in r['prov']: continue
            if k.startswith('man:'): src = 'manual entry (platform.openai.com/docs/pricing for prices)' if f in ('priceIn', 'priceOut') else 'manual entry'
            elif f in ('priceIn', 'priceOut', 'maxOut', 'tools', 'json', 'reasoning', 'inputMods') and r.get('orid'): src = 'OpenRouter models/endpoints API'
            elif f in ('license', 'params', 'languages', 'embedDim') or (f in ('context', 'release') and not r.get('orid')): src = 'Hugging Face API/config.json'
            else: src = 'OpenRouter models API' if r.get('orid') else 'Hugging Face API'
            r['prov'][f] = src

def run(models, R, rec, assign_fn, variants_of, index, templates):
    stats = collections.Counter()
    for mid, name, mk, ty, pi, c, src in NEW_MANUAL:
        r = rec(mid); r.update(name=name, maker=mk, weights='Closed', license='Proprietary', localGPU='No (closed)'); r['types'].update(ty)
        r['comments'].append(c); r['sources'].add('Manual (frontier closed)'); r['inputMods'] = ['text']
        setp(r, 'priceIn', pi, src)
        if mid in NEW_CHARS: setp(r, 'priceChars', NEW_CHARS[mid], src)
        index_add(index, variants_of, mid, r)
    for k, v in VENDOR.items():
        if k in models:
            for f, val in v.items():
                if f != 'src': setp(models[k], f, val, v['src'])
    for k, c in VENDOR_COMMENTS.items():
        if k in models: models[k]['comments'].append(c)

    # ---------- Artificial Analysis (public leaderboard page RSC payload) ----------
    aa = json.load(open(f'{R}/aa/aa_models.json'))
    hits = collections.defaultdict(list)
    for m in aa:
        ks = set()
        for n in (m['name'], m.get('shortName') or '', m['slug']):
            for v in variants_of(n): ks |= index.get(v, set())
        for k in ks: hits[k].append(m)
    for k, ms in hits.items():
        r = models[k]; src = 'Artificial Analysis leaderboard (artificialanalysis.ai/leaderboards/models, 2026-10-15)'
        sp = [m['medianOutputTokensPerSecond'] for m in ms if m.get('medianOutputTokensPerSecond')]
        lt = [m['medianTimeToFirstTokenSeconds'] for m in ms if m.get('medianTimeToFirstTokenSeconds')]
        if setp(r, 'speed', round(statistics.median(sp), 1) if sp else None, src): stats['speed'] += 1
        if setp(r, 'latency', round(statistics.median(lt), 2) if lt else None, src): stats['latency'] += 1
        real = [m['intelligenceIndex'] for m in ms if m.get('intelligenceIndex') is not None and not m.get('intelligenceIndexIsEstimated')]
        est = [m['intelligenceIndex'] for m in ms if m.get('intelligenceIndex') is not None and m.get('intelligenceIndexIsEstimated')]
        if real: setp(r, 'aaIndex', round(max(real), 1), src); r['aaIndexEstimated'] = False
        elif est: setp(r, 'aaIndex', round(max(est), 1), src + ' (AA marks as estimated)'); r['aaIndexEstimated'] = True
        if setp(r, 'context', max((m['contextWindowTokens'] for m in ms if m.get('contextWindowTokens')), default=None), src): stats['context'] += 1
        if r.get('reasoning') is None and r['types'] & {'text', 'vision'} and any(m.get('isReasoning') for m in ms):
            setp(r, 'reasoning', True, src + ' (has reasoning variant)'); stats['reasoning'] += 1
        if r.get('priceIn') is None:
            pi = [m['price1mInputTokens'] for m in ms if m.get('price1mInputTokens') is not None]
            po = [m['price1mOutputTokens'] for m in ms if m.get('price1mOutputTokens') is not None]
            if pi and po and setp(r, 'priceIn', statistics.median(pi), src):
                setp(r, 'priceOut', statistics.median(po), src); r['comments'].append('Price from Artificial Analysis (no OpenRouter quotes); not a per-provider median'); stats['price'] += 1
        for b in ['gpqa', 'hle', 'tau2', 'terminalbenchHard', 'ifbench', 'scicode', 'lcr', 'mmmuPro']:
            vals = [m[b] for m in ms if m.get(b) is not None]
            if vals: r['bench']['aa_' + b] = max(vals)
    stats['aa_matched'] = len(hits)

    # ---------- MTEB (embedding aptitude) ----------
    mt = json.load(open(f'{R}/mteb_summary.json'))
    for name, v in mt['models'].items():
        k = MTEB_ALIASES.get(name) or ('hf:' + name if 'hf:' + name in models else None)
        if k and k in models: models[k]['bench']['mteb_eng14'] = v['mean']; stats['mteb'] += 1
    # ---------- Open ASR leaderboard (lower WER is better -> store negative) ----------
    with open(f'{R}/asr/english_short_latest.csv') as f:
        for row in csv.DictReader(f):
            if not row.get('avg'): continue
            nm = re.sub(r'\s*\(.*$', '', row['model'].strip('"'))
            ks = set()
            for n in (nm, re.sub(r'-hf$', '', nm)):
                ks |= {('hf:' + n)} & set(models)
                for v in variants_of(n): ks |= index.get(v, set())
            for k in ks:
                b = models[k]['bench']; val = -float(row['avg'])
                if val > b.get('asr_neg_wer', -1e9): b['asr_neg_wer'] = val
                models[k]['benchNote'] = 'asr_neg_wer = −(avg WER %), matched by model name (repacks/quantizations of the same weights included)'
                stats['asr'] += 1
    # ---------- TTS Arena V2 ----------
    for row in json.load(open(f'{R}/tts_arena.json'))['rows']:
        for k in TTS_ALIASES.get(row['name'], []):
            if k in models: models[k]['bench']['tts_arena_elo'] = row['elo']; stats['tts'] += 1

    # ---------- HF chat templates -> tool calling / reasoning (evidence-only: never sets False) ----------
    for k, r in models.items():
        t = templates.get(r.get('hf') or '')
        if not t or not (r['types'] & {'text', 'vision'}): continue
        t = json.dumps(t)
        if r.get('tools') is None and re.search(r'\btools\b', t): setp(r, 'tools', True, 'HF tokenizer chat_template handles tools'); stats['tools_tmpl'] += 1
        if r.get('reasoning') is None and re.search(r'enable_thinking|<think>|reasoning_content', t): setp(r, 'reasoning', True, 'HF chat_template has thinking mode'); stats['reason_tmpl'] += 1
    # ---------- parameter counts from official open-weight model names (e.g. "Llama 3.1 8B") ----------
    for k, r in models.items():
        if r.get('params') is None and r['weights'] == 'Open':
            n = (r.get('hf') or r['name']).split('/')[-1]
            m = re.search(r'(?<![\dA-Za-z.])(\d+(?:\.\d+)?)\s*[Bb](?![a-z])', n)
            if m and not re.search(r'A\d', n[m.start() - 1:m.start()]):
                setp(r, 'params', float(m.group(1)), 'parsed from official model name: ' + n); stats['params_name'] += 1
    for k, (p, src) in PARAM_ESTIMATES.items():
        if k in models and setp(models[k], 'params', p, src): models[k]['paramsEstimated'] = True; stats['params_est'] += 1
    for r in models.values():
        if r['weights'] == 'Open' and r.get('params') and r.get('localGPU') is None:
            p = r['params']; r['localGPU'] = 'Yes (<=14B)' if p <= 14 else ('High-end/quantized (14-40B)' if p <= 40 else 'No (>40B)')
    base_prov(models)
    return stats

def index_add(index, variants_of, key, r):
    for n in {r['name'], key.split(':', 1)[-1]}:
        for v in variants_of(n): index[v].add(key)

# ---------- community (anecdotal) ----------
JOB_KW = [('coding.refactor', r'refactor'), ('coding.debug', r'\bdebug'), ('coding.review', r'code review|reviewing (the |my )?code|\bPR reviews?\b'),
          ('coding.test', r'unit tests?|writing tests|test generation'), ('agents.functions', r'tool[- ]call|function[- ]call'), ('agents.workflows', r'\bagentic\b')]
POS = r"(works?|worked|working) (really |very |pretty |super )?(well|great|perfectly)|\b(great|excellent|good|amazing|incredible|solid|best) (at|for)\b|successfully|nailed|impressive|impressed|reliabl|handled? (it|this|that)? ?(well|perfectly)|better (at|for)\b|my go-to|daily driver"
def community(models, R, targets):
    stats = collections.Counter(); cands = {}
    def scan(text, aliases, url, source):
        found = []
        low = (text or '').lower()
        if not any(a.lower() in low for a in aliases): return found  # model must be named in the post/issue
        sents = [x.strip() for x in re.split(r'(?<=[.!?])\s+|\n+', text or '') if x.strip()]
        first_person = re.search(r"\b(i|i'?ve|i'?m|we|my|our)\b", text or '', re.I)
        if not first_person: return found
        for i in range(len(sents)):
            win = ' '.join(sents[i:i + 2])  # sentence + next sentence
            if len(win) < 20 or sents[i].endswith('?') or not re.search(POS, win, re.I): continue
            if not any(a.lower() in win.lower() for a in aliases): continue  # model named in the same window
            if re.search(r'claim|rumou?r|announc|reportedly|benchmark|according to|\bif\b', win, re.I): continue
            for tag, rx in JOB_KW:
                if re.search(rx, win, re.I) and not any(f[0] == tag for f in found): found.append((tag, {'source': source, 'url': url, 'quote': win[:220]}))
        return found
    for t in targets:
        k = t['id']
        if k not in models: continue
        r = models[k]
        aliases = {t['slug'], t['name'], re.sub(r'^[^:]+:\s*', '', t['name'])}
        ev = collections.defaultdict(list)
        f = f'{R}/community/github/{t["slug"]}.json'
        if os.path.exists(f):
            d = (json.load(open(f)).get('data') or {})
            for it in d.get('items', []):
                for tag, e in scan((it.get('title') or '') + '\n' + (it.get('body') or ''), aliases, it['html_url'], 'GitHub'): ev[tag].append(e)
        for f in glob.glob(f'{R}/community/x/*.json'):
            d = json.load(open(f))
            if t['slug'] not in d['slug'].split('|'): continue
            for p in (d['data'].get('data') or []):
                for tag, e in scan(p['text'], aliases | set(d['names']), p['url'], 'X'): ev[tag].append(e)
        if ev:
            cands[k] = {tag: es[:3] for tag, es in ev.items()}; stats['auto_candidate_models'] += 1
    # Automated hits are only CANDIDATES (raw/community/candidates.json): manual review showed most are false positives
    # (bug reports, quotes about other models). Only manually reviewed first-person reports in curated.json reach the catalog.
    json.dump(cands, open(f'{R}/community/candidates.json', 'w'), indent=1)
    for c in json.load(open(f'{R}/community/curated.json')):
        if c['id'] not in models: continue
        r = models[c['id']]
        for tag in c['tags']:
            r['jobsAnecdotal'].setdefault(tag, []).append({'source': c['source'], 'url': c['url'], 'quote': c['quote'], 'anecdotal': True})
            stats['curated_tags'] += 1
    stats['curated_models'] = sum(1 for r in models.values() if r['jobsAnecdotal'])
    return stats

# ---------- 'Available from' (multi-valued): keys "<group>:<provider>" ----------
CLOUD = {'Amazon Bedrock': 'AWS Bedrock', 'Google': 'Google Vertex AI', 'Azure': 'Azure', 'Claude Platform on AWS': 'Claude Platform on AWS'}
MAKER_DIRECT = {  # catalog maker slug -> OpenRouter provider name that IS the maker's own API
  'openai': 'OpenAI', 'anthropic': 'Anthropic', 'google': 'Google AI Studio', 'mistralai': 'Mistral', 'qwen': 'Alibaba', 'x-ai': 'xAI',
  'z-ai': 'Z.AI', 'minimax': 'Minimax', 'deepseek': 'DeepSeek', 'cohere': 'Cohere', 'moonshotai': 'Moonshot AI', 'xiaomi': 'Xiaomi',
  'tencent': 'Tencent', 'baidu': 'Baidu', 'bytedance-seed': 'Seed', 'meta': 'Meta', 'meta-llama': 'Meta', 'nvidia': 'Nvidia',
  'perplexity': 'Perplexity', 'upstage': 'Upstage', 'sakana': 'Sakana AI', 'poolside': 'Poolside', 'liquid': 'Liquid', 'inception': 'Inception',
  'stepfun': 'StepFun', 'rekaai': 'Reka', 'relace': 'Relace', 'morph': 'Morph', 'aion-labs': 'AionLabs', 'nex-agi': 'Nex AGI',
  'perceptron': 'Perceptron', 'scaledown': 'ScaleDown', 'thinkingmachines': 'Thinking Machines', 'unbiased': 'Unbiased', 'arcee-ai': 'Arcee AI',
  'inference-net': 'InferenceNet'}
HF_PROV = {'featherless-ai': 'Featherless', 'deepinfra': 'DeepInfra', 'hf-inference': 'HF Inference API', 'novita': 'Novita', 'together': 'Together',
           'nscale': 'Nscale', 'fal-ai': 'fal', 'zai-org': 'Z.AI', 'scaleway': 'Scaleway', 'wavespeed': 'WaveSpeed', 'ovhcloud': 'OVHcloud',
           'fireworks-ai': 'Fireworks', 'baseten': 'BaseTen', 'replicate': 'Replicate', 'groq': 'Groq', 'cerebras': 'Cerebras'}
HF_DIRECT = {'zai-org': {'z-ai', 'zai-org'}}
MANUAL_AVAIL = {  # vendor pricing pages fetched earlier (see comments/prov of those entries)
  'man:openai/': ('direct:OpenAI', 'platform.openai.com/docs/pricing'), 'man:google/gemini-embedding-2': ('direct:Google AI Studio', 'ai.google.dev/gemini-api/docs/pricing'),
  'man:elevenlabs/v': ('direct:ElevenLabs', 'elevenlabs.io/pricing/api'), 'man:deepgram/': ('direct:Deepgram', 'deepgram.com/pricing')}

def availability(models, R):
    hfp = {}
    p = f'{R}/hf_providers.json'
    if os.path.exists(p): hfp = json.load(open(p))['models']
    stats = collections.Counter()
    for k, r in models.items():
        av, src = set(), set()
        maker = (r.get('maker') or '').lower()
        if r.get('orid'):
            av.add('agg:OpenRouter'); src.add('OpenRouter models API')
            ep = json.load(open(f"{R}/ep/{r['orid'].replace('/', '_').replace(':', '_')}.json")) if os.path.exists(f"{R}/ep/{r['orid'].replace('/', '_').replace(':', '_')}.json") else {}
            for e in ((ep.get('data') or {}).get('endpoints') or []):
                pn = e.get('provider_name')
                if not pn: continue
                if pn in CLOUD: av.add('cloud:' + CLOUD[pn])
                elif MAKER_DIRECT.get(maker) == pn or (maker == 'meta-llama' and pn == 'Meta'): av.add('direct:' + pn)
                else: av.add('agg:' + pn)
                src.add('OpenRouter per-provider endpoints')
        if r.get('hf'):
            if r.get('weights') == 'Open': av.add('self:Hugging Face (download)'); src.add('Hugging Face Hub (open weights)')
            live = hfp.get(r['hf'], [])
            if live: av.add('agg:Hugging Face Inference Providers'); src.add('HF inferenceProviderMapping (live)')
            for pv in live:
                name = HF_PROV.get(pv, pv)
                av.add(('direct:' if maker in HF_DIRECT.get(pv, set()) else 'agg:') + name)
        for pre, (key, s) in MANUAL_AVAIL.items():
            if k.startswith('man:' ) and k.startswith(pre): av.add(key); src.add(s)
        r['availableFrom'] = sorted(av) or None
        if av: r['prov']['availableFrom'] = '; '.join(sorted(src))
        for a in av: stats[a.split(':')[0]] += 1
    return stats
