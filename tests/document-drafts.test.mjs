import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';
function harness() {
  const chat = { id: 'chat-a', draftFiles: [] };
  const attempts = [];
  const sdk = loadUts('uni_modules/uni-ai-x/sdk/document-drafts.uts', ['documentDrafts', 'addPendingDocument', 'removePendingDocument', 'retryPendingDocument'], {
    reactive: value => value, uniAi: { chat: { datas: [chat] } },
    uploadDeepSeekDocument(_path, name, onTask) {
      return new Promise((resolve, reject) => {
        const entry = { name, resolve, reject, aborted: false };
        onTask({ onProgressUpdate(fn) { entry.progress = fn; }, abort() { entry.aborted = true; } });
        attempts.push(entry);
      });
    },
  });
  return { ...sdk, chat, attempts };
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
