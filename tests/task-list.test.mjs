import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const { prepareLibmarkHtml, prepareMarkdownHtml } = loadUts(
  'uni_modules/uni-ai-worker/utssdk/markdown-html.uts',
  ['prepareLibmarkHtml', 'prepareMarkdownHtml'],
);
const checkbox = '<input type="checkbox" checked disabled>';

for (const prepare of [prepareLibmarkHtml, prepareMarkdownHtml]) {
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
