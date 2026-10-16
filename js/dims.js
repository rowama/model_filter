// Dimension + taxonomy definitions. Pure data, shared by engine and UI.
(function (root) {
  const ALL = ['text', 'embed', 'vision', 't2i', 'stt', 'tts'];
  const TXT = ['text', 'vision'];
  const TYPES = [
    { id: 'all', label: 'All types' }, { id: 'text', label: 'Text generation' }, { id: 'embed', label: 'Embeddings' },
    { id: 'vision', label: 'Vision' }, { id: 't2i', label: 'Text-to-image' }, { id: 'stt', label: 'Speech-to-text' }, { id: 'tts', label: 'Text-to-speech' }];
  const fmtK = v => v >= 1e6 ? +(v / 1e6).toPrecision(3) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(v);
  const fmt$ = v => '$' + (v < 1 ? +v.toPrecision(2) : +v.toFixed(2));
  const fmtYM = v => { const y = Math.floor(v + 1e-9), m = Math.round((v - y) * 12) + 1; return y + '-' + String(m).padStart(2, '0'); };
  const ym = s => s ? (+s.slice(0, 4)) + (+s.slice(5, 7) - 1) / 12 : null;
  const num = (id, label, field, top, opts = {}) => ({ id, label, field, kind: 'numeric', top, types: opts.types || ALL, fmt: opts.fmt || (v => String(v)), unit: opts.unit || '', get: opts.get, col: opts.col || label, step: opts.step });
  const cat = (id, label, field, tree, opts = {}) => ({ id, label, field, kind: 'categorical', multi: !!opts.multi, tree, types: opts.types || ALL, show: opts.show, get: opts.get, strictGet: opts.strictGet, leafLabels: !!opts.leafLabels });
  const yesno = [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }];
  const boolGet = f => m => m[f] === null || m[f] === undefined ? null : (m[f] ? 'yes' : 'no');
  const JOBS = [
    { key: 'coding', label: 'Coding', children: [{ key: 'coding.create', label: 'Creating code' }, { key: 'coding.refactor', label: 'Refactoring' }, { key: 'coding.review', label: 'Reviewing' }, { key: 'coding.debug', label: 'Debugging' }, { key: 'coding.test', label: 'Testing' }, { key: 'coding.web', label: 'Web/frontend' }] },
    { key: 'writing', label: 'Writing', children: [{ key: 'writing.creative', label: 'Creative/fiction' }, { key: 'writing.roleplay', label: 'Roleplay/characters' }, { key: 'writing.business', label: 'Business/marketing' }, { key: 'writing.summarize', label: 'Summarization' }] },
    { key: 'reasoning', label: 'Reasoning & math', children: [{ key: 'reasoning.math', label: 'Math' }, { key: 'reasoning.logic', label: 'Logic/step-by-step' }, { key: 'reasoning.science', label: 'Science/research' }] },
    { key: 'extraction', label: 'Data extraction', children: [{ key: 'extraction.json', label: 'Structured JSON' }, { key: 'extraction.docs', label: 'Documents/OCR' }, { key: 'extraction.classify', label: 'Classification/tagging' }] },
    { key: 'agents', label: 'Agents & tool use', children: [{ key: 'agents.functions', label: 'Function calling' }, { key: 'agents.workflows', label: 'Multi-step agentic' }, { key: 'agents.computer', label: 'Computer/browser use' }] },
    { key: 'chat', label: 'Chat', children: [{ key: 'chat.assistant', label: 'General assistant' }, { key: 'chat.support', label: 'Customer support' }] },
    { key: 'translation', label: 'Translation', children: [{ key: 'translation.general', label: 'Multilingual translation' }] },
    { key: 'retrieval', label: 'Retrieval & search', children: [{ key: 'retrieval.search', label: 'Semantic search/RAG' }, { key: 'retrieval.rerank', label: 'Reranking' }, { key: 'retrieval.cluster', label: 'Clustering' }] },
    { key: 'vision', label: 'Vision understanding', children: [{ key: 'vision.describe', label: 'Image description' }, { key: 'vision.charts', label: 'Charts/diagrams' }, { key: 'vision.ocr', label: 'OCR' }, { key: 'vision.video', label: 'Video' }] },
    { key: 'imagegen', label: 'Image generation', children: [{ key: 'imagegen.photo', label: 'General/photoreal' }, { key: 'imagegen.edit', label: 'Editing/inpainting' }] },
    { key: 'speech', label: 'Speech', children: [{ key: 'speech.transcribe', label: 'Transcription' }, { key: 'speech.synthesis', label: 'Speech synthesis' }, { key: 'speech.clone', label: 'Voice cloning' }] },
  ];
  const LICENSE = [
    { key: 'lic.permissive', label: 'Permissive', children: [{ key: 'Apache-2.0', label: 'Apache-2.0' }, { key: 'MIT', label: 'MIT' }, { key: 'BSD', label: 'BSD' }, { key: 'CC-BY', label: 'CC-BY' }] },
    { key: 'lic.copyleft', label: 'Copyleft/share-alike', children: [{ key: 'GPL', label: 'GPL family' }, { key: 'CC-BY-SA', label: 'CC-BY-SA' }] },
    { key: 'lic.restricted', label: 'Open but restricted', children: [{ key: 'Llama community', label: 'Llama community' }, { key: 'Gemma terms', label: 'Gemma terms' }, { key: 'OpenRAIL', label: 'OpenRAIL' }, { key: 'CC-BY-NC', label: 'Non-commercial (CC-BY-NC)' }, { key: 'Other/custom', label: 'Other/custom' }] },
    { key: 'Proprietary', label: 'Proprietary' },
  ];
  const MODS = ['text', 'image', 'audio', 'video', 'file'].map(k => ({ key: k, label: k }));
  const DIMS = [
    cat('weights', 'Weights', 'weights', [{ key: 'Open', label: 'Open' }, { key: 'Closed', label: 'Closed' }]),
    cat('license', 'License', 'license', LICENSE),
    num('priceIn', 'Input price', 'priceIn', [[0, 0.1], [0.1, 1], [1, 5], [5, Infinity]], { fmt: fmt$, unit: '/1M', col: 'In $/1M' }),
    num('priceOut', 'Output price', 'priceOut', [[0, 0.5], [0.5, 2], [2, 10], [10, Infinity]], { fmt: fmt$, unit: '/1M', col: 'Out $/1M' }),
    num('intelligence', 'Intelligence', 'intelligence', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: TXT, col: 'Intel.' }),
    num('context', 'Context window', 'context', [[0, 1e5], [1e5, 5e5], [5e5, 1e6], [1e6, Infinity]], { types: ['text', 'vision', 'embed'], fmt: fmtK, unit: ' tokens', col: 'Context' }),
    cat('jobs', 'Job', 'jobs', JOBS, { multi: true, strictGet: m => (m.jobs || []).filter(j => !(m.jobsAnecdotalOnly || []).includes(j)) }),
    num('aptCoding', 'Coding score', 'aptCoding', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: TXT, col: 'Coding' }),
    num('aptReasoning', 'Reasoning score', 'aptReasoning', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: TXT, col: 'Reason.' }),
    num('aptWriting', 'Writing/chat score', 'aptWriting', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: TXT, col: 'Writing' }),
    num('aptInstruct', 'Instruction/extraction score', 'aptInstruct', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: TXT, col: 'Instr.' }),
    num('aptAgents', 'Agentic score', 'aptAgents', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: TXT, col: 'Agents' }),
    num('aptVision', 'Vision score', 'aptVision', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: ['vision'], col: 'Vision' }),
    num('aaIndex', 'AA intelligence index', 'aaIndex', [[0, 20], [20, 40], [40, 60], [60, Infinity]], { types: TXT, col: 'AA idx' }),
    num('aptEmbedding', 'Embedding score (MTEB)', 'aptEmbedding', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: ['embed'], col: 'MTEB' }),
    num('aptSTT', 'Transcription score (Open ASR)', 'aptSTT', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: ['stt'], col: 'ASR' }),
    num('aptTTS', 'Speech quality score (TTS Arena)', 'aptTTS', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: ['tts'], col: 'TTS' }),
    num('aptImageGen', 'Image-gen score', 'aptImageGen', [[0, 25], [25, 50], [50, 75], [75, Infinity]], { types: ['t2i'], col: 'ImgGen' }),
    cat('maker', 'Maker', 'maker', null),
    cat('availableFrom', 'Available from', 'availableFrom', null, { multi: true, leafLabels: true }),
    num('params', 'Parameters', 'params', [[0, 3], [3, 15], [15, 80], [80, Infinity]], { unit: 'B', fmt: v => String(v), col: 'Params B' }),
    num('maxOut', 'Max output', 'maxOut', [[0, 8192], [8192, 32768], [32768, 131072], [131072, Infinity]], { types: TXT, fmt: fmtK, unit: ' tokens', col: 'Max out' }),
    num('speed', 'Speed', 'speed', [[0, 50], [50, 100], [100, 200], [200, Infinity]], { types: TXT, unit: ' tok/s', col: 'tok/s' }),
    num('latency', 'Latency (TTFT)', 'latency', [[0, 0.5], [0.5, 1], [1, 5], [5, Infinity]], { types: TXT, unit: ' s', col: 'TTFT s' }),
    num('priceAudioMin', 'Audio price', 'priceAudioMin', [[0, 0.003], [0.003, 0.006], [0.006, Infinity]], { types: ['stt'], fmt: v => '$' + v, unit: '/min', col: '$/min' }),
    num('priceChars', 'Character price', 'priceChars', [[0, 20], [20, 50], [50, Infinity]], { types: ['tts'], fmt: v => '$' + v, unit: '/1M chars', col: '$/1M ch' }),
    num('release', 'Release', 'release', [[0, 2024], [2024, 2025], [2025, 2026], [2026, Infinity]], { fmt: fmtYM, get: m => ym(m.release), col: 'Released', step: 1 / 12 }),
    cat('tools', 'Tool calling', 'tools', yesno, { types: TXT, get: boolGet('tools') }),
    cat('json', 'Structured JSON', 'json', yesno, { types: TXT, get: boolGet('json') }),
    cat('reasoning', 'Reasoning mode', 'reasoning', yesno, { types: TXT, get: boolGet('reasoning') }),
    cat('localGPU', 'Runs locally', 'localGPU', [{ key: 'Yes (<=14B)', label: 'Yes (≤14B params)' }, { key: 'High-end/quantized (14-40B)', label: 'High-end GPU / quantized (14–40B)' }, { key: 'No (>40B)', label: 'No (>40B)' }, { key: 'No (closed)', label: 'No (closed weights)' }]),
    cat('inputMods', 'Input', 'inputMods', MODS, { multi: true, types: TXT }),
    cat('languages', 'Language', 'languages', null, { multi: true }),
    num('embedDim', 'Embedding dim', 'embedDim', [[0, 512], [512, 1024], [1024, 2048], [2048, Infinity]], { types: ['embed'], col: 'Emb dim' }),
  ];
  // data-driven trees (maker, languages): top N + "Other" with the rest as children
  function finishDims(models) {
    const topN = (field, n, labelFn) => {
      const c = {}; models.forEach(m => [].concat(m[field] || []).forEach(v => c[v] = (c[v] || 0) + 1));
      const ks = Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b));
      const tree = ks.slice(0, n).map(k => ({ key: k, label: labelFn(k) }));
      const rest = ks.slice(n).sort();
      if (rest.length) tree.push({ key: '__other_' + field, label: 'Other', children: rest.map(k => ({ key: k, label: labelFn(k) })) });
      return tree;
    };
    for (const d of DIMS) {
      if (d.id === 'maker') d.tree = topN('maker', 15, k => k);
      if (d.id === 'languages') d.tree = topN('languages', 12, k => k);
      if (d.id === 'availableFrom') {
        const G = [['direct', 'Direct from maker'], ['agg', 'Aggregators'], ['cloud', 'Cloud platforms'], ['self', 'Self-host (open weights download)']];
        const c = {}; models.forEach(m => (m.availableFrom || []).forEach(v => c[v] = (c[v] || 0) + 1));
        d.tree = G.map(([g, label]) => ({ key: 'avail.' + g, label,
          children: Object.keys(c).filter(k => k.startsWith(g + ':')).sort((a, b) => c[b] - c[a] || a.localeCompare(b)).map(k => ({ key: k, label: k.slice(g.length + 1) })) }))
          .filter(n => n.children.length);
      }
    }
    return DIMS;
  }
  // parameter display: estimated (closed-model) counts are shown as '~200B (est.)'
  const fmtParams = m => m.params == null ? 'unrated' : (m.paramsEstimated ? `~${+(+m.params).toPrecision(4)}B (est.)` : `${+(+m.params).toPrecision(4)}`);
  root.MF_DIMS = { TYPES, DIMS, finishDims, ALL_TYPES: ALL, fmtParams };
})(typeof window !== 'undefined' ? window : globalThis);
