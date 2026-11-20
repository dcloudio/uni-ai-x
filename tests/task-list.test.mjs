import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const { prepareUniAiMdHtml, prepareMarkdownHtml } = loadUts(
  'uni_modules/uni-ai-x/utssdk/worker/markdown-html.uts',
  ['prepareUniAiMdHtml', 'prepareMarkdownHtml'],
  { Number: Object.assign(value => Number(value), { from: value => Number(value) }) },
);
const checkbox = '<input type="checkbox" checked disabled>';

test('typography preserves self-closing rules and text in both themes', () => {
  const source = '<h1>Title</h1><hr /><p>Body</p>';
  for (const theme of ['light', 'dark']) {
    const html = prepareUniAiMdHtml(source, true, theme);
    assert.match(html, /<hr\s+style="[^"]*"\s*\/>/);
    assert.ok(!html.includes('/ style='));
    assert.equal(html.replace(/<[^>]*>/g, ''), 'TitleBody');
    assert.ok(html.includes(theme === 'dark' ? '#f3f4f6' : '#1b1c24'));
  }
});

for (const prepare of [prepareUniAiMdHtml, prepareMarkdownHtml]) {
  test(`${prepare.name}: nested task markers replace bullets at every level`, () => {
    const html = prepare(`<ul><li>${checkbox}parent<ul><li>${checkbox}child<ul><li>${checkbox}leaf</li></ul></li></ul></li></ul>`, true);
    const items = html.match(/<li\b[^>]*>/g);
    assert.equal(items.length, 3);
    assert.ok(items.every(item => item.includes('list-style-type:none')));
  });

  test(`${prepare.name}: mixed lists retain ordinary markers and loose task labels`, () => {
    const html = prepare(`<ol><li><p>ordinary parent</p><ul><li><p>${checkbox}task child</p><ul><li>ordinary child</li></ul></li><li>ordinary sibling</li></ul></li></ol>`, true);
    const items = html.match(/<li\b[^>]*>/g);
    assert.deepEqual(items.map(item => item.includes('list-style-type:none')), [false, true, false, false]);
    assert.ok(html.includes('<p'));
    assert.ok(!/<p\b[^>]*>\s*<img data-uni-ai-task/.test(html));
    assert.equal((html.match(/<\/li>/g) ?? []).length, 4);
  });
}
