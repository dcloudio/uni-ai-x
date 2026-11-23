import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const block = (key, extra = {}) => ({ key, kind: 'html', text: '', html: '<p>' + key + '</p>', isComplete: true,
  svgSource: '', svgWidth: 0, svgHeight: 0, ...extra });
function display() {
  const resources = new Set();
  const api = loadUts('uni_modules/uni-ai-x/sdk/message-display.uts', ['MessageDisplayState', 'readMessageDisplay'], {
    isMessageViewResourceSettled: (_id, resource) => resources.has(resource),
  });
  const state = new api.MessageDisplayState();
  const msg = { _id: 'm', body: '', rendered: false };
  return { msg, resources, read: (blocks, finished = false, waitForViewResources = true) => api.readMessageDisplay(state, msg, blocks, finished, 'light', 390, waitForViewResources) };
}
const search = (status, sources = []) => ({ status, sources, query: 'query', error: '' });

test('search arriving after thinking and thinking arriving after body appear only at the end', () => {
  const api = display();
  api.msg.thinkContent = 'first thought';
  assert.equal(api.read([]).think, 'first thought');
  api.msg.search = search('searching');
  assert.equal(api.read([]).search, null);
  api.msg.body = 'answer';
  api.read([block('body')]);
  api.msg.thinkContent += ' late thought';
  assert.equal(api.read([block('body')]).think, 'first thought');
  api.msg.search.status = 'completed'; api.msg.rendered = true;
  const final = api.read([block('body')], true);
  assert.equal(final.lateThink, ' late thought');
  assert.equal(final.lateSearch.status, 'completed');
});

test('tool progress seals thought and remains at the tail until the next model content', () => {
  const api = display();
  api.msg.toolStatus = 'working';
  assert.equal(api.read([]).toolStatus, 'working');
  api.msg.thinkContent = 'late thinking';
  assert.equal(api.read([]).think, '');
  api.msg.body = 'answer';
  assert.equal(api.read([block('body')]).toolStatus, 'working');
  api.msg.toolStatus = '';
  assert.equal(api.read([block('body')]).toolStatus, '');
});

test('retry invalidates an empty failure snapshot even when the reset render was batched away', () => {
  const api = display();
  api.msg.rendered = true;
  api.msg.error_msg = '天气查询超时';
  assert.equal(api.read([], true).tailMessage.error_msg, '天气查询超时');
  api.msg.answerAttempt = 1;
  api.msg.rendered = false;
  api.msg.error_msg = null;
  api.msg.toolStatus = '正在连接';
  const retry = api.read([]);
  assert.equal(retry.complete, false);
  assert.equal(retry.tailMessage.error_msg, null);
  assert.equal(retry.toolStatus, '正在连接');
  api.msg.body = '新的天气结果';
  api.msg.rendered = true;
  assert.equal(api.read([block('new')], true).tailMessage.body, '新的天气结果');
});

test('successors wait for image termination and committed prefixes ignore later rewrites', () => {
  const api = display(); api.msg.body = 'answer';
  const diagram = block('diagram', { kind: 'mermaid', text: 'graph LR; A-->B', mermaidImageSource: '/image', svgWidth: 100, svgHeight: 50 });
  const end = block('end');
  assert.equal(api.read([diagram, end]).blocks.length, 1);
  api.resources.add('light:/image');
  const submitted = api.read([diagram, end]);
  assert.equal(submitted.blocks.length, 2);
  const changed = block('diagram', { kind: 'data-text', text: 'rewritten' });
  assert.equal(api.read([changed, end]).blocks[0].kind, 'mermaid');
});

test('prepared historical diagrams and formulae release all successors without mounted image callbacks', () => {
  const api = display(); api.msg.body = 'history'; api.msg.rendered = true;
  const diagram = block('diagram', { kind: 'mermaid', mermaidImageSource: '/diagram', svgWidth: 100, svgHeight: 50 });
  const formula = block('formula', { kind: 'math', svgSource: '/formula', svgWidth: 80, svgHeight: 30 });
  const result = api.read([diagram, formula, block('end')], true, false);
  assert.equal(result.blocks.length, 3);
  assert.equal(result.complete, true);
});

test('history still waits for generated dimensions and highlighted code before committing successors', () => {
  for (const pending of [
    block('diagram', { kind: 'mermaid', mermaidImageSource: '/diagram' }),
    block('formula', { kind: 'math', svgSource: '/formula' }),
    block('code', { kind: 'code', text: 'let value = 1' }),
  ]) {
    const api = display(); api.msg.body = 'history'; api.msg.rendered = true;
    const result = api.read([pending, block('end')], true, false);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.complete, false);
  }
});

test('final error and sources snapshots preserve body and cannot change under the toolbar', () => {
  const api = display(); api.msg.body = 'answer'; api.msg.rendered = true;
  api.msg.error_msg = 'interrupted';
  api.msg.search = search('completed', [{ id: 1, title: 'old', url: 'url' }]);
  const final = api.read([block('body')], true);
  api.msg.search.sources[0].title = 'new'; api.msg.error_msg = 'replacement';
  const later = api.read([block('body', { html: 'changed' })], true);
  assert.equal(later, final);
  assert.equal(later.blocks[0].html, '<p>body</p>');
  assert.equal(later.tailMessage.search.sources[0].title, 'old');
  assert.equal(later.tailMessage.error_msg, 'interrupted');
});

test('a calendar outcome updates after completion without reopening committed body', () => {
  const api = display(); api.msg.body = 'answer'; api.msg.rendered = true;
  api.msg.toolResultText = '准备创建提醒';
  const final = api.read([block('body')], true);
  api.msg.toolStatus = '正在创建';
  assert.equal(api.read([block('body')], true).toolStatus, '正在创建');
  api.msg.toolStatus = '';
  api.msg.toolResultText = '已取消创建提醒';
  const canceled = api.read([block('body', { html: 'rewritten' })], true);
  assert.equal(canceled.toolStatus, '');
  assert.equal(canceled.tailMessage.toolResultText, '已取消创建提醒');
  assert.equal(canceled.blocks, final.blocks);
  assert.equal(canceled.blocks[0].html, '<p>body</p>');
});

test('interrupted special tails have a source terminal state', () => {
  const api = display(); api.msg.body = 'unfinished'; api.msg.rendered = true;
  const final = api.read([block('formula', { kind: 'math', text: 'x^', isComplete: false })], true);
  assert.equal(final.complete, true);
  assert.equal(final.blocks[0].kind, 'data-text');
});
