import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts', ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { LibmarkHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-worker/utssdk/libmark-html.uts', ['LibmarkHtmlStreamAdapter'], {
  ...html, TextEncoder, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
});
const op = (op, content, kind, index) => ({ op, content, kind, index, unchanged: false });

const formulaSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="62" height="14" viewBox="0 0 62 14"><path d="M0 0h62v14H0z"/></svg>';
const mermaidSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="140" viewBox="0 0 320 140"><path d="M0 0h320v140H0z"/></svg>';

test('inline formula svg stays inside the html block', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(1, `<p>爱因斯坦的质能方程：${formulaSvg}</p>`, 'html', 3)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'html');
  assert.ok(blocks[0].html.includes(formulaSvg));
});

test('top-level svg following a closed block is still extracted as an image block', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(1, `<h3>第二种：时序图（sequence）</h3>\n${mermaidSvg}`, 'html', 7)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'html');
  assert.equal(blocks[1].kind, 'image');
  assert.equal(Buffer.from(blocks[1].svgSource.split(',')[1], 'base64').toString(), mermaidSvg);
  assert.equal(blocks[1].svgWidth, 320);
  assert.equal(blocks[1].svgHeight, 140);
});

test('inline formula svg is skipped while the later top-level svg is extracted', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(1, `<p>公式：${formulaSvg}</p>\n${mermaidSvg}`, 'html', 5)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'html');
  assert.ok(blocks[0].html.includes(formulaSvg));
  assert.equal(blocks[1].kind, 'image');
  assert.equal(Buffer.from(blocks[1].svgSource.split(',')[1], 'base64').toString(), mermaidSvg);
});

test('standalone svg from the fragment start remains an image block', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(1, mermaidSvg, 'html', 9)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'image');
});

test('committed html with inline svg keeps a single html block', () => {
  const adapter = new LibmarkHtmlStreamAdapter();
  adapter.applyOps([op(3, `<p>勾股定理：${formulaSvg}</p>`, 'html', 2)]);
  const blocks = adapter.getBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'html');
  assert.ok(blocks[0].html.includes(formulaSvg));
});
