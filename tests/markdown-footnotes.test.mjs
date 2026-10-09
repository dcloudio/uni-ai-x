import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import createCmark from '../uni_modules/uni-cmark/utssdk/web/cmark-gfm-md2html.mjs';

const source = readFileSync(new URL('../uni_modules/uni-ai-x/sdk/markdown-footnotes.uts', import.meta.url), 'utf8');
const api = vm.createContext({});
vm.runInContext(stripTypeScriptTypes(source.replace(/^export /gm, '')), api);
const cmark = await createCmark();
const convert = cmark.cwrap('uni_cmark_markdown_to_html', 'number', ['string', 'number', 'number']);

test('actual cmark footnote output becomes an internal link with the correct explanation', () => {
  const markdown = '文字[^1]和[^2]。\n\n[^1]: 这是第一个脚注的详细说明。\n[^2]: 第二个说明\n    续行。';
  const pointer = convert(markdown, Buffer.byteLength(markdown), 0);
  try {
    const html = api.linkMarkdownFootnotes(cmark.UTF8ToString(pointer), markdown);
    assert.match(html, /href="#uni-ai-footnote-1"/);
    assert.match(html, /href="#uni-ai-footnote-2"/);
    assert.equal(api.markdownFootnotes(markdown).get('2'), '第二个说明\n续行。');
    assert.equal(api.footnoteLabel('#uni-ai-footnote-1'), '1');
  } finally { cmark._uni_cmark_free_html(pointer); }
});

test('code definitions, normal links, unknown labels and other message definitions stay separate', () => {
  const html = '<code>[^1]</code><a href="https://example.com">普通链接</a><a href="x">^2</a>';
  assert.equal(api.linkMarkdownFootnotes(html, '[^1]: 说明'), html);
  assert.equal(api.markdownFootnotes('```md\n[^1]: 代码\n```').size, 0);
  assert.equal(api.markdownFootnotes('[^1]: 另一个消息').get('1'), '另一个消息');
  assert.equal(api.footnoteLabel('#uni-ai-footnote-%invalid'), '');
  assert.equal(api.footnoteLabel('https://example.com'), '');
});
