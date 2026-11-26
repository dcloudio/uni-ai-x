import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const { markCodeBlocks } = loadUts('uni_modules/uni-ai-x/utssdk/worker/markdown-html.uts', ['markCodeBlocks']);
const code = '<pre><code class="language-js">hello</code></pre>';

test('a streaming code tail waits, while a following rendered block seals it', () => {
  assert.match(markCodeBlocks(code + '\n</div>', false), /data-uni-ai-complete="0"/);
  assert.match(markCodeBlocks(code + '<p>next</p>', false), /data-uni-ai-complete="1"/);
  assert.match(markCodeBlocks(code, true), /data-uni-ai-complete="1"/);
});

test('a following code block seals the first while its own tail remains open', () => {
  const result = markCodeBlocks(code + code, false);
  assert.deepEqual([...result.matchAll(/data-uni-ai-complete="(\d)"/g)].map(m => m[1]), ['1', '0']);
});
