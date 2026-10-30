import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts', ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { UniAiMdHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-worker/utssdk/uni-ai-md-html.uts', ['UniAiMdHtmlStreamAdapter'], {
  ...html, TextEncoder, Number: { from: Number }, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
});
const op = (op, content, kind, index) => ({ op, content, kind, index, unchanged: false });

test('Gantt native SVG absorbs the paired DATA envelope instead of rendering twice', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const source = 'gantt\n  title Project delivery\n  section Development\n  Requirements :a1, 2026-10-01, 2d';
  const svg = '<svg width="320" height="140"><text>gantt</text></svg>';
  adapter.applyOps([
    op(3, svg, 'html', 7),
    op(3, JSON.stringify({ type: 'mermaid', source, svg }), 'data', 7),
  ]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'mermaid');
  assert.equal(blocks[0].text, source);
  assert.equal(blocks[0].svgWidth, 320);
  assert.equal(blocks[0].svgHeight, 140);
  assert.equal(Buffer.from(blocks[0].svgSource.split(',')[1], 'base64').toString(), svg);
});

test('Mermaid DATA tail remains source until the block is committed', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const source = 'flowchart TD\n A-->B';
  const payload = JSON.stringify({ type: 'mermaid', source });
  adapter.applyOps([op(2, payload, 'data', 3)]);
  assert.equal(adapter.getBlocks()[0].isComplete, false);
  adapter.applyOps([op(3, payload, 'data', 3)]);
  assert.equal(adapter.getBlocks()[0].isComplete, true);
});

test('completed math DATA tail keeps its existing completion state', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const payload = JSON.stringify({ type: 'math', status: 'complete', source: 'x', svg: '<svg width="10" height="10"></svg>' });
  adapter.applyOps([op(2, payload, 'data', 4)]);
  assert.equal(adapter.getBlocks()[0].isComplete, true);
});

test('closed Mermaid HTML can use WebView when native SVG is absent', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  adapter.applyOps([op(1, '<pre><code class="language-mermaid">flowchart TD\n A--&gt;B</code></pre>', 'html', 4)]);
  const block = adapter.getBlocks()[0];
  assert.equal(block.kind, 'mermaid');
  assert.equal(block.isComplete, true);
  assert.equal(block.text, 'flowchart TD\n A-->B');
});

test('pending Mermaid fence stays code even if its HTML fragment is closed', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  adapter.applyOps([op(1, '<pre><code class="language-mermaid-pending">flowchart TD\n A--&gt;B</code></pre>', 'html', 5)]);
  const block = adapter.getBlocks()[0];
  assert.equal(block.kind, 'code');
  assert.equal(block.language, 'mermaid-pending');
});
