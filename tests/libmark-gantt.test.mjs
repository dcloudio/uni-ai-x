import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts', ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { LibmarkHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-worker/utssdk/libmark-html.uts', ['LibmarkHtmlStreamAdapter'], {
  ...html, TextEncoder, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
});
const op = (op, content, kind, index) => ({ op, content, kind, index, unchanged: false });

test('Gantt native SVG absorbs the paired DATA envelope instead of rendering twice', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
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
