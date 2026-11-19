import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';
function harness() {
  const chat = { id: 'chat-a', draftFiles: [] };
  const attempts = [];
  const watchers = [];
  const ai = { llm: {provider: 'deepseek', model: 'deepseek-flash'}, chat: { datas: [chat] } };
  const sdk = loadUts('uni_modules/uni-ai-x/sdk/document-drafts.uts', ['documentDrafts', 'addPendingDocument', 'removePendingDocument', 'retryPendingDocument'], {
    watch(_getter, callback) { watchers.push(callback); }, reactive: value => value, uniAi: ai, supportsDeepSeekApps: (provider) => provider === 'deepseek',
    uploadDeepSeekDocument(_path, name, onTask) {
      return new Promise((resolve, reject) => {
        const entry = { name, resolve, reject, aborted: false };
        onTask({ onProgressUpdate(fn) { entry.progress = fn; }, abort() { entry.aborted = true; } });
        attempts.push(entry);
      });
    },
  });
  return { ...sdk, chat, attempts, ai, watchers };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('document draft reports upload and parsing, then attaches only the completed file', async () => {
  const h = harness();
  h.addPendingDocument('chat-a', '/sample.txt', 'sample.txt');
  const entry = h.documentDrafts.pending[0];
  assert.equal(entry.phase, 'uploading');
  h.attempts[0].progress({ progress: 100 });
  assert.equal(entry.phase, 'parsing');
  assert.equal(h.chat.draftFiles.length, 0);
  h.attempts[0].resolve({ id: 'file-api-1', name: 'sample.txt', provider: 'deepseek' });
  await tick();
  assert.equal(h.documentDrafts.pending.length, 0);
  assert.equal(h.chat.draftFiles[0].id, 'file-api-1');
});
test('removing an uploading card aborts it and ignores a late success', async () => {
  const h = harness();
  h.addPendingDocument('chat-a', '/sample.txt', 'sample.txt');
  h.removePendingDocument(h.documentDrafts.pending[0].key);
  assert.equal(h.attempts[0].aborted, true);
  h.attempts[0].resolve({ id: 'file-api-late', name: 'sample.txt', provider: 'deepseek' });
  await tick();
  assert.equal(h.chat.draftFiles.length, 0);
});
test('failed upload remains visible and can retry without duplicate attachments', async () => {
  const h = harness();
  h.addPendingDocument('chat-a', '/sample.txt', 'sample.txt');
  h.attempts[0].reject(new Error('offline'));
  await tick();
  const entry = h.documentDrafts.pending[0];
  assert.equal(entry.phase, 'failed');
  const retry = h.retryPendingDocument(entry.key);
  h.attempts[1].resolve({ id: 'file-api-retry', name: 'sample.txt', provider: 'deepseek' });
  await retry;
  assert.equal(h.chat.draftFiles.length, 1);
  assert.equal(h.documentDrafts.pending.length, 0);
});

test('retry after switching to gateway never calls official document upload', async () => {
  const h = harness(); h.addPendingDocument('chat-a', '/sample.txt', 'sample.txt');
  h.attempts[0].reject(new Error('offline')); await tick();
  h.ai.llm.provider = 'qiniu';
  await h.retryPendingDocument(h.documentDrafts.pending[0].key);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.documentDrafts.pending[0].phase, 'failed');
  assert.match(h.documentDrafts.pending[0].error, /当前方案/);
});

test('switching to gateway aborts an official upload and ignores a late attachment', async () => {
  const h = harness(); h.addPendingDocument('chat-a', '/sample.txt', 'sample.txt');
  h.ai.llm.provider = 'qiniu'; h.watchers[0]();
  assert.equal(h.attempts[0].aborted, true);
  h.attempts[0].resolve({id:'file-api-late',provider:'deepseek'}); await tick();
  assert.equal(h.chat.draftFiles.length, 0);
  assert.equal(h.documentDrafts.pending[0].phase, 'failed');
});
