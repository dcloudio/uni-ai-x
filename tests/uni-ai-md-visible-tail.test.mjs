import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const html = loadUts('uni_modules/uni-ai-x/utssdk/worker/markdown-html.uts', ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { UniAiMdHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-x/utssdk/worker/uni-ai-md-html.uts', ['UniAiMdHtmlStreamAdapter'], {
  ...html, TextEncoder, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
});
const { MessageDisplayState, readMessageDisplay } = loadUts('uni_modules/uni-ai-x/sdk/message-display.uts', ['MessageDisplayState', 'readMessageDisplay'], {
  isMessageViewResourceSettled: () => true,
});
const op = (op, content, index) => ({ op, content, kind: 'html', index, unchanged: false });

for (const [title, tail] of [
  ['任务复选框列表', '<ul><li>已完成任务</li><li>未完成任务</li></ul><h2>表格</h2>'],
  ['块引用', '<blockquote><p>这是一段普通的引用文本。</p></blockquote><h2>代码块</h2>'],
  ['数学公式', '<h4>代数公式</h4>'],
]) {
  test(`流式 HTML 尾部合并后仍显示${title}的全部内容`, () => {
    const adapter = new UniAiMdHtmlStreamAdapter();
    const state = new MessageDisplayState();
    const msg = { _id: title, body: 'streaming markdown', rendered: false };
    const read = (finished = false) => readMessageDisplay(state, msg, adapter.getBlocks(), finished, 'light', 390);
    const prefix = `<h2>${title}</h2>`;
    adapter.applyOps([op(3, prefix, 0)]);
    read();
    adapter.applyOps([op(2, tail, 1)]);
    read();
    adapter.applyOps([op(3, tail, 1)]);
    msg.rendered = true;
    const final = read(true);
    assert.equal(final.complete, true);
    assert.equal(final.blocks.map(block => block.html).join(''), prefix + tail);
  });
}

test('真正的后继代码块仍等待 HTML 尾部提交且不会冻结半段正文', () => {
  const adapter = new UniAiMdHtmlStreamAdapter();
  const state = new MessageDisplayState();
  const msg = { _id: 'code-boundary', body: 'markdown', rendered: false };
  const read = () => readMessageDisplay(state, msg, adapter.getBlocks(), false, 'light', 390);
  adapter.applyOps([op(3, '<h2>块引用</h2>', 0), op(2, '<p>引用正文</p><h2>代码块</h2>', 1)]);
  read();
  adapter.applyOps([op(3, '<p>引用正文</p><h2>代码块</h2>', 1), op(2, '<pre><code>hello', 2)]);
  const display = read();
  assert.ok(display.blocks[0].html.includes('引用正文'));
  assert.equal(display.blocks[1].kind, 'code');
});
