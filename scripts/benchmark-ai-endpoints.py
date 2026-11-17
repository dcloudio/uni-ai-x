#!/usr/bin/env python3
"""Alternate the original gateway and DeepSeek with identical streaming prompts.

QINIU_TOKEN_FILE supplies a temporary token; DEEPSEEK_API_KEY overrides config.uts.
Run from the repository root. No credentials are saved in benchmark results.
"""
import datetime
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
prompt = (ROOT / 'benchmark/markdown-speed-prompt.txt').read_text().removesuffix('\n')
expected = prompt.split('待输出固定内容：\n', 1)[1]
deepseek_key = os.environ.get('DEEPSEEK_API_KEY') or re.search(
    r"return '(sk-[^']+)'", (ROOT / 'uni_modules/uni-ai-x/config.uts').read_text()).group(1)
qiniu_token = Path(os.environ['QINIU_TOKEN_FILE']).read_text().strip()
thinking_type = os.environ.get('BENCHMARK_THINKING', 'enabled')
if thinking_type not in ('enabled', 'disabled'):
    raise ValueError('BENCHMARK_THINKING must be enabled or disabled')
targets = [
    ('A', 'https://openai.qiniu.com/v1/chat/completions', 'deepseek/deepseek-v4.1-flash', qiniu_token),
    ('B', 'https://api.deepseek.com/chat/completions', 'deepseek-flash', deepseek_key),
]
selected_target = os.environ.get('BENCHMARK_TARGET')
if selected_target:
    targets = [t for t in targets if t[0] == selected_target]
    if not targets:
        raise ValueError('BENCHMARK_TARGET must be A or B')
round_count = int(os.environ.get('BENCHMARK_ROUNDS', '5'))
out = ROOT / os.environ.get('BENCHMARK_OUTPUT', 'benchmark/endpoint-speed-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
out.mkdir(parents=True)
rows = []
(out / 'method.json').write_text(json.dumps({
    'order': [t[0] for t in targets] * round_count, 'thinking': {'type': thinking_type}, 'stream': True,
    'max_tokens': 16384, 'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
    'prompt_chars': len(prompt), 'expected_chars': len(expected),
    'timing': 'perf_counter; POST to first nonempty reasoning/content and EOF; excludes token acquisition',
    'targets': [{'id': x[0], 'url': x[1], 'model': x[2]} for x in targets],
}, ensure_ascii=False, indent=2))
print('RESULT_DIR', out, flush=True)

for run in range(1, round_count + 1):
    for label, url, model, token in targets:
        row = {'target': label, 'run': run, 'model': model, 'first_delta_s': None,
               'first_content_s': None, 'first_reasoning_s': None, 'done': False,
               'finish_reason': None, 'usage': None, 'events': 0}
        content, reasoning, raw = [], [], []
        body = {'model': model, 'messages': [{'role': 'user', 'content': prompt}],
                'stream': True, 'thinking': {'type': thinking_type}, 'max_tokens': 16384,
                'stream_options': {'include_usage': True}}
        req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode(),
              headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        print(f'START {label}{run}', flush=True)
        if label == 'A' and os.environ.get('REFRESH_QINIU_TOKEN') == '1':
            token_file = Path(os.environ['QINIU_TOKEN_FILE'])
            previous = token_file.stat().st_mtime_ns
            print(f'NEED_TOKEN A{run}', flush=True)
            deadline = time.perf_counter() + 120
            while token_file.stat().st_mtime_ns == previous:
                if time.perf_counter() > deadline:
                    raise TimeoutError('Waiting for a fresh Qiniu token')
                time.sleep(0.1)
            req.add_header('Authorization', 'Bearer ' + token_file.read_text().strip())
        start = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                row['http_status'] = response.status
                row['headers_s'] = time.perf_counter() - start
                for line in response:
                    now = time.perf_counter() - start
                    if now > 300:
                        raise TimeoutError('Exceeded 300 second overall request budget')
                    raw.append(line.decode('utf-8'))
                    if not line.startswith(b'data:'):
                        continue
                    data = line[5:].strip()
                    if data == b'[DONE]':
                        row['done'] = True
                        continue
                    event = json.loads(data)
                    if event.get('error'):
                        raise RuntimeError(json.dumps(event['error'], ensure_ascii=False))
                    row['events'] += 1
                    if event.get('usage'):
                        row['usage'] = event['usage']
                    row['response_model'] = event.get('model', row.get('response_model'))
                    for choice in event.get('choices', []):
                        if choice.get('finish_reason'):
                            row['finish_reason'] = choice['finish_reason']
                        delta = choice.get('delta', {})
                        for field, chunks, metric in [('content', content, 'first_content_s'),
                                ('reasoning_content', reasoning, 'first_reasoning_s')]:
                            text = delta.get(field) or ''
                            if text:
                                chunks.append(text)
                                if row[metric] is None:
                                    row[metric] = now
                                    print(f'{label}{run} {metric}={now:.3f}', flush=True)
                                if row['first_delta_s'] is None:
                                    row['first_delta_s'] = now
            row['success'] = row['done'] and row['finish_reason'] == 'stop' and bool(content)
        except urllib.error.HTTPError as error:
            row.update(success=False, http_status=error.code, error=error.read().decode()[:1000])
        except Exception as error:
            row.update(success=False, error=str(error))
        row['total_s'] = time.perf_counter() - start
        answer = ''.join(content)
        row.update(content_chars=len(answer), reasoning_chars=len(''.join(reasoning)),
                   exact_match=answer == expected, trim_match=answer.strip() == expected.strip())
        (out / f'{label}{run}.md').write_text(answer)
        (out / f'{label}{run}.reasoning.txt').write_text(''.join(reasoning))
        (out / f'{label}{run}.sse.txt').write_text(''.join(raw))
        (out / f'{label}{run}.diff').write_text(''.join(difflib.unified_diff(
            expected.splitlines(True), answer.splitlines(True), fromfile='expected', tofile='actual')))
        rows.append(row)
        (out / 'results.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
        print('RESULT ' + json.dumps(row, ensure_ascii=False), flush=True)

summary = {}
for label, *_ in targets:
    good = [r for r in rows if r['target'] == label and r['success']]
    summary[label] = {'successful': len(good), 'attempted': round_count,
                      'exact_matches': sum(r['exact_match'] for r in good)}
    for metric in ['first_delta_s', 'first_content_s', 'total_s', 'content_chars', 'reasoning_chars']:
        values = [r[metric] for r in good if r[metric] is not None]
        if values:
            summary[label][metric] = {'mean': statistics.mean(values),
                  'median': statistics.median(values), 'min': min(values), 'max': max(values)}
(out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print('SUMMARY ' + json.dumps(summary, ensure_ascii=False), flush=True)
