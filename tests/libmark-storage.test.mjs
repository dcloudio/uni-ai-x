import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const message = () => ({ _id: 'm', chat_id: 'c', from_uid: 'uni-ai', body: 'hello', rendered: false,
  create_time: 1, markdownHtml: '<p>old</p>', markdownAst: 'old', markdownBlocks: '[{}]', libmarkRevision: 4 });

test('native storage retains source and search results, excluding transient render caches', () => {
  const { serializeMessage } = loadUts('uni_modules/uni-ai-x/sdk/storage-manager.uts', ['serializeMessage']);
  const msg = { ...message(), search: { status: 'completed', sources: [{ id: 1, url: 'https://example.com' }] } };
  const result = JSON.parse(serializeMessage(msg));
  assert.equal(result.body, msg.body);
  assert.deepEqual(result.search, msg.search);
  for (const key of ['markdownHtml', 'markdownAst', 'markdownBlocks']) assert.equal(result[key], '');
  assert.equal(result.libmarkRevision, 0);
  assert.equal(msg.markdownHtml, '<p>old</p>');
});

test('interrupted historical native replies become eligible for Worker rebuild', () => {
  const data = new Map([['uni-ai-chat-c-msgIds', '["m"]'], ['uni-ai-msg-m', JSON.stringify(message())]]);
  const { StorageManager } = loadUts('uni_modules/uni-ai-x/sdk/storage-manager.uts', ['StorageManager'], {
    uni: { getStorageSync: key => data.get(key) ?? '' }, setTimeout: () => 1, console,
  });
  const msg = new StorageManager().getChatMessages('c')[0];
  assert.equal(msg.rendered, true);
  assert.equal(msg.libmarkRevision, 0);
  assert.equal(msg.body, 'hello');
  assert.equal(msg.markdownBlocks, '');
});

test('Web retains its cmark render snapshot', () => {
  const { serializeMessage } = loadUts('uni_modules/uni-ai-x/sdk/storage-manager.uts', ['serializeMessage'], {}, ['WEB']);
  assert.deepEqual(JSON.parse(serializeMessage(message())), message());
});
