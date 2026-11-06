import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts',
  ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { UniAiMdHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-worker/utssdk/uni-ai-md-html.uts',
  ['UniAiMdHtmlStreamAdapter'], {
    ...html, TextEncoder, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
  });
const op = (type, index, content) => ({ op: type, kind: 'html', index, content, unchanged: type === 3 });

test('late append for a committed paragraph cannot replace the current list tail', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const title = '<p>北京当前天气信息如下：</p>\n';
  const list = '<ul><li>当前天气：晴</li></ul>\n';
  const footer = '<p>早晚偏凉。</p>\n';

  adapter.applyOps([op(2, 0, title), op(3, 0, title), op(2, 1, list)]);
  adapter.applyOps([op(1, 0, '<p>北京</p>\n')]);
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), title + list);

  adapter.applyOps([op(3, 1, list), op(1, 2, footer)]);
  adapter.markComplete();
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), title + list + footer);
});

test('reset permits a new stream to reuse block indices', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  adapter.applyOps([op(3, 0, '<p>旧回答</p>')]);
  adapter.applyOps([{ op: 4, kind: 'html', index: 0, content: '', unchanged: false },
    op(3, 0, '<p>新回答</p>')]);
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), '<p>新回答</p>');
});

test('completion before the final list op does not duplicate the list', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const title = '<p>北京当前天气：</p>\n';
  const partial = '<ul><li>气温：9°C</li></ul>\n';
  const list = '<ul><li>气温：9°C</li><li>晴</li></ul>\n';
  const footer = '<p>夜间较凉。</p>\n';

  adapter.applyOps([op(3, 0, title), op(2, 1, partial)]);
  adapter.markComplete();
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), title + partial);

  adapter.applyOps([op(3, 1, list), op(1, 2, footer)]);
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), title + list + footer);
});

test('later content for a provisional paragraph replaces its early fragment', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  adapter.applyOps([op(1, 0, '<p>北京</p>\n')]);
  adapter.markComplete();
  adapter.applyOps([op(1, 0, '<p>北京现在天气：晴。</p>\n')]);
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), '<p>北京现在天气：晴。</p>\n');
});

test('revising a provisional block preserves the preceding merged html', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const title = '<p>天气如下：</p>\n';
  adapter.applyOps([op(3, 0, title), op(1, 1, '<p>气温</p>\n')]);
  adapter.applyOps([op(3, 1, '<p>气温 9°C。</p>\n')]);
  assert.equal(adapter.getBlocks().map(block => block.html).join(''), title + '<p>气温 9°C。</p>\n');
});
