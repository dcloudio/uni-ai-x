import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts', ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { LibmarkHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-worker/utssdk/libmark-html.uts', ['LibmarkHtmlStreamAdapter'], {
  ...html, TextEncoder, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
});
const op = (op, content, kind = 'html', index = 0) => ({ op, content, kind, index, unchanged: false });
const svg = '<svg width="240" height="80"><text>示例</text></svg>';

test('code preview becomes one completed block and reset removes previous output', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(2, '<pre><code class="language-js">const a = 1;')]);
  assert.equal(adapter.getBlocks()[0].isComplete, false);
  adapter.applyOps([op(3, '<pre><code class="language-js">const a = 1;\n</code></pre>')]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, 'const a = 1;');
  assert.equal(blocks[0].language, 'js');
  assert.equal(blocks[0].isComplete, true);
  adapter.applyOps([op(4, ''), op(3, '<p>new</p>')]);
  assert.equal(adapter.getBlocks().length, 1);
  assert.equal(adapter.getBlocks()[0].html, '<p>new</p>');
});

test('math DATA updates in place and preserves native SVG dimensions', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(3, JSON.stringify({ type: 'math', source: 'x^2', status: 'partial' }), 'data', 3)]);
  const key = adapter.getBlocks()[0].key;
  adapter.applyOps([op(3, JSON.stringify({ type: 'math', source: 'x^2', status: 'complete', svg }), 'data', 3)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].key, key);
  assert.equal(blocks[0].isComplete, true);
  assert.equal(blocks[0].svgWidth, 240);
  assert.equal(Buffer.from(blocks[0].svgSource.split(',')[1], 'base64').toString(), svg);
});

test('Mermaid native SVG and fallback source stay associated with separate blocks', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(3, svg, 'html', 1), op(3, JSON.stringify({ type: 'mermaid', source: 'graph TD; A-->B', svg }), 'data', 1)]);
  adapter.applyOps([op(3, JSON.stringify({ type: 'mermaid', source: 'gantt\n title Plan' }), 'data', 2)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'mermaid');
  assert.ok(blocks[0].svgSource.length > 0);
  assert.equal(blocks[1].svgSource, '');
  assert.match(blocks[1].text, /^gantt/);
});

test('released rebuilds cannot repopulate memory and reset permits retry after failure', () => {
  const requests = [];
  const store = loadUts('uni_modules/uni-ai-x/sdk/libmark-stream-store.uts', [
    'libmarkStreamRequestRebuild', 'libmarkStreamApplyRebuild', 'libmarkStreamGetBlocks', 'libmarkStreamRelease', 'libmarkStreamReset',
  ], {
    LibmarkHtmlStreamAdapter, requestAiWorkerMarkdownRebuild: (...args) => requests.push(args),
    libmarkHtmlBlocksToTextBlocks: blocks => blocks, ref: value => ({ value }),
    prepareCodeBlocks: (_id, blocks, ready) => ready(blocks), prepareNativeMermaidBlocks() {},
  });
  assert.equal(store.libmarkStreamRequestRebuild('m', 'hello'), true);
  assert.equal(store.libmarkStreamRequestRebuild('m', 'hello'), false);
  store.libmarkStreamRelease('m');
  assert.equal(store.libmarkStreamApplyRebuild('m', [op(3, '<p>late</p>')]), false);
  assert.equal(store.libmarkStreamGetBlocks('m').length, 0);
  store.libmarkStreamRequestRebuild('m', 'hello');
  store.libmarkStreamApplyRebuild('m', []);
  assert.equal(store.libmarkStreamRequestRebuild('m', 'hello'), false);
  store.libmarkStreamReset('m');
  assert.equal(store.libmarkStreamRequestRebuild('m', 'hello'), true);
  assert.equal(requests.length, 3);
});
