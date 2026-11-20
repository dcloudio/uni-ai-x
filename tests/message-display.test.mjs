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
  return { msg, resources, read: (blocks, finished = false) => api.readMessageDisplay(state, msg, blocks, finished, 'light', 390) };
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

test('tool progress seals thought and disappears before a body successor is visible', () => {
  const api = display();
  api.msg.toolStatus = 'working';
  assert.equal(api.read([]).toolStatus, 'working');
  api.msg.thinkContent = 'late thinking';
  assert.equal(api.read([]).think, '');
  api.msg.body = 'answer';
  assert.equal(api.read([block('body')]).toolStatus, '');
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

test('interrupted special tails have a source terminal state', () => {
  const api = display(); api.msg.body = 'unfinished'; api.msg.rendered = true;
  const final = api.read([block('formula', { kind: 'math', text: 'x^', isComplete: false })], true);
  assert.equal(final.complete, true);
  assert.equal(final.blocks[0].kind, 'data-text');
});
