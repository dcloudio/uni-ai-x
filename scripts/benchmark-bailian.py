#!/usr/bin/env python3
"""Stream identical prompts through Bailian temporary tokens and DeepSeek.

BAILIAN_KEY_FILE holds the permanent test key outside the repository.
No keys or temporary tokens are written to results.
"""
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get('BAILIAN_BENCHMARK_OUTPUT', 'benchmark/bailian-speed-20261116-exact-version')
OUT.mkdir(parents=True, exist_ok=True)
HOST = 'https://ws-vpb0xezwi79yq5ai.cn-beijing.maas.aliyuncs.com'
key = Path(os.environ['BAILIAN_KEY_FILE']).read_text().strip()
BAILIAN_MODEL = os.environ.get('BAILIAN_MODEL', 'deepseek-v4.1-flash-1017')
direct_key = re.search(r"return '(sk-[^']+)'", (ROOT / 'uni_modules/uni-ai-x/config.uts').read_text()).group(1)
prompt = (ROOT / 'benchmark/markdown-speed-prompt.txt').read_text().removesuffix('\n')
expected = prompt.split('待输出固定内容：\n', 1)[1]

def request(url, token, body=None):
    return urllib.request.Request(url, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')

rows = []
targets = ('deepseek', 'bailian', 'qiniu') if os.environ.get('QINIU_TOKEN_FILE') else ('bailian', 'deepseek')
(OUT / 'method.json').write_text(json.dumps({
    'order': list(targets) * 6, 'discarded_runs': [1],
    'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
    'bailian_host': HOST, 'temporary_token_ttl_s': 60,
    'bailian_model': BAILIAN_MODEL, 'deepseek_model': 'deepseek-flash',
    'thinking': False, 'stream': True, 'max_tokens': 16384,
    'timing': 'Computer API; perf_counter before urlopen through SSE DONE/EOF; token acquisition excluded and measured separately',
}, indent=2))
for run in range(1, 7):
    for target in targets:
        row = {'run': run, 'target': target, 'first_body_s': None, 'reasoning_chars': 0}
        token = direct_key
        if target == 'bailian':
            t = time.perf_counter()
            try:
                with urllib.request.urlopen(request(HOST + '/api/v1/tokens?expire_in_seconds=60', key), timeout=20) as res:
                    auth = json.load(res)
                token = auth['token']
                row['token_s'] = time.perf_counter() - t
                row['token_ttl_remaining_s'] = auth['expires_at'] - time.time()
            except urllib.error.HTTPError as exc:
                print('TOKEN_ERROR', exc.code, exc.read().decode()[:1500], flush=True)
                raise SystemExit(1)
        model = BAILIAN_MODEL if target == 'bailian' else 'deepseek-flash'
        url = HOST + '/compatible-mode/v1/chat/completions' if target == 'bailian' else 'https://api.deepseek.com/chat/completions'
        if target == 'qiniu':
            token = Path(os.environ['QINIU_TOKEN_FILE']).read_text().strip()
            model = 'deepseek/deepseek-v4.1-flash'
            url = 'https://openai.qiniu.com/v1/chat/completions'
        body = {'model': model, 'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': 16384, 'stream': True, 'stream_options': {'include_usage': True}}
        body.update({'enable_thinking': False} if target == 'bailian' else {'thinking': {'type': 'disabled'}})
        req = request(url, token, body)
        content, raw = [], []
        done, finish = False, None
        print('START', run, target, flush=True)
        start = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                row['headers_s'] = time.perf_counter() - start
                for line in res:
                    elapsed = time.perf_counter() - start
                    if elapsed > 120:
                        raise TimeoutError('Overall 120s budget exceeded')
                    raw.append(line.decode())
                    if not line.startswith(b'data:'):
                        continue
                    data = line[5:].strip()
                    if data == b'[DONE]':
                        done = True
                        break
                    event = json.loads(data)
                    if event.get('error'):
                        raise RuntimeError(str(event['error']))
                    row['response_model'] = event.get('model', row.get('response_model'))
                    if event.get('usage'):
                        row['usage'] = event['usage']
                    for choice in event.get('choices', []):
                        finish = choice.get('finish_reason') or finish
                        delta = choice.get('delta', {})
                        row['reasoning_chars'] += len(delta.get('reasoning_content') or '')
                        text = delta.get('content') or ''
                        if text:
                            if row['first_body_s'] is None:
                                row['first_body_s'] = elapsed
                            content.append(text)
            row['success'] = done and finish == 'stop' and bool(content) and row['reasoning_chars'] == 0
        except urllib.error.HTTPError as exc:
            row.update(success=False, http_status=exc.code, error=exc.read().decode()[:1500])
        except Exception as exc:
            row.update(success=False, error=str(exc))
        row['total_s'] = time.perf_counter() - start
        row['body_output_s'] = row['total_s'] - row['first_body_s'] if row['first_body_s'] is not None else None
        answer = ''.join(content)
        row.update(content_chars=len(answer), exact_match=answer == expected, trim_match=answer.strip() == expected.strip())
        label = f'{target}{run}'
        (OUT / (label + '.md')).write_text(answer)
        (OUT / (label + '.sse.txt')).write_text(''.join(raw))
        (OUT / (label + '.diff')).write_text(''.join(difflib.unified_diff(expected.splitlines(True), answer.splitlines(True))))
        rows.append(row)
        (OUT / 'results.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
        print('RESULT', json.dumps(row, ensure_ascii=False), flush=True)
        if not row['success']:
            raise SystemExit('Failed request; inspect results before continuing')

summary = {}
for target in targets:
    good = [r for r in rows if r['target'] == target and r['run'] > 1 and r['success']]
    summary[target] = {'averaged_runs': [r['run'] for r in good]}
    for metric in ('first_body_s', 'body_output_s', 'total_s', 'token_s'):
        vals = [r[metric] for r in good if metric in r]
        if vals:
            summary[target][metric] = {'mean': statistics.mean(vals), 'min': min(vals), 'max': max(vals)}
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2))
print('SUMMARY', json.dumps(summary), flush=True)
