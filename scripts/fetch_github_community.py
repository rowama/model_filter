#!/usr/bin/env python3
"""Search public GitHub issues/discussions (unauthenticated search API, 10 req/min) for job-usage reports per model."""
import json, time, urllib.request, urllib.error, urllib.parse, os, sys
R = os.path.join(os.path.dirname(__file__), '..', 'raw'); os.makedirs(f'{R}/community/github', exist_ok=True)
targets = json.load(open(f'{R}/community_targets.json'))
JOBQ = '(refactoring OR debugging OR "code review" OR "unit tests" OR "tool calling" OR agentic)'  # GitHub allows max 5 boolean operators
for t in targets:
    out = f"{R}/community/github/{t['slug']}.json"
    if os.path.exists(out): continue
    q = f'"{t["slug"]}" {JOBQ}'
    url = 'https://api.github.com/search/issues?' + urllib.parse.urlencode({'q': q, 'per_page': 30, 'sort': 'reactions'})
    req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'model-filter-research'})
    for attempt in range(3):
        try:
            data = json.load(urllib.request.urlopen(req, timeout=30)); break
        except urllib.error.HTTPError as e:
            data = None; print('err', t['slug'], e.code, flush=True)
            if e.code in (403, 429): time.sleep(65)
            else: break
    json.dump({'query': q, 'url': url, 'data': data}, open(out, 'w'))
    print(t['slug'], (data or {}).get('total_count'), flush=True)
    time.sleep(6.5)
