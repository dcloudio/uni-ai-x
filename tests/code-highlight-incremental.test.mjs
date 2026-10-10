import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function setup() {
  const calls = [];
  const states = new Map();
  const released = [];
  class CreateHighLighter {
    async tokenizeLines(id, language, lines, reset) {
      calls.push({ id, language, lines, reset });
      let comment = reset ? false : states.get(id) ?? false;
      const result = lines.map(line => {
        if (line.includes('/*')) comment = true;
        const scopes = comment ? ['comment.block'] : ['source.js'];
        if (line.includes('*/')) comment = false;
        return { tokens: [{ startIndex: 0, endIndex: line.length, scopes }] };
      });
      states.set(id, comment);
      return result;
    }
    releaseSession(id) { released.push(id); states.delete(id); }
  }
  const api = loadUts('uni_modules/uni-ai-x/sdk/parseCode.uts',
    ['requestCachedCodeText', 'releaseCodeHighlightSessions', 'clearCodeHighlightCache', 'completedCodeCache', 'codeCacheWeight', 'highlightSessions'], {
      CreateHighLighter, MarkdownToken: {},
      uni: { getFileSystemManager: () => ({ readFileSync: path => readFileSync(new URL('..' + path, import.meta.url), 'utf8') }) },
      utils: { runOnDispatcher: (_dispatcher, callback) => callback() }, measureCodePerformance() {},
    }, ['APP', 'APP-ANDROID']);
  const request = (source, block = 'a', message = 'm') => new Promise(resolve => api.requestCachedCodeText(resolve, message, block, source, 'js'));
  return { ...api, request, calls, states, released };
}

test('streaming highlights only new lines and preserves isolated multiline syntax state', async () => {
  const api = setup();
  await api.request('/* comment');
  const other = await api.request('const other = 1', 'b');
  const next = await api.request('/* comment\nstill comment\n*/');
  assert.equal(other.lines[0][0].className, '');
  assert.equal(next.lines[1][0].className, 'comment');
  assert.deepEqual(api.calls.map(call => Array.from(call.lines)), [['/* comment'], ['const other = 1'], ['still comment', '*/']]);
  assert.equal(api.calls[2].reset, false);
  const changed = await api.request('const replacement = 1');
  assert.equal(changed.lines[0][0].className, '');
  assert.equal(api.calls[3].reset, true);
});

test('concurrent requests coalesce to the latest prefix without leaving callbacks pending', async () => {
  const api = setup();
  const results = await Promise.all([api.request('one'), api.request('one\ntwo'), api.request('one\ntwo\nthree')]);
  assert.equal(results[0].error, null);
  assert.notEqual(results[1].error, null);
  assert.equal(results[2].error, null);
  assert.deepEqual(api.calls.map(call => Array.from(call.lines)), [['one'], ['two', 'three']]);
  api.releaseCodeHighlightSessions('m');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.states.size, 0);
  assert.equal(api.released.length, 1);
});

test('one block retains only its latest result and release removes its cached source', async () => {
  const api = setup();
  for (let i = 1; i <= 100; i++) await api.request(Array(i).fill('line').join('\n'));
  assert.equal(api.completedCodeCache.size, 1);
  assert.equal(api.calls.reduce((sum, call) => sum + call.lines.length, 0), 100);
  api.releaseCodeHighlightSessions('m');
  assert.equal(api.completedCodeCache.size, 0);
  assert.equal(api.highlightSessions.size, 0);
});

test('clearing pending work settles callbacks and prevents stale cache restoration', async () => {
  const api = setup();
  const pending = api.request('first');
  const latest = api.request('first\nsecond');
  api.clearCodeHighlightCache();
  assert.notEqual((await pending).error, null);
  assert.notEqual((await latest).error, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.completedCodeCache.size, 0);
  assert.equal(api.highlightSessions.size, 0);
  assert.equal((await api.request('fresh')).error, null);
});

test('changing the last line resets the syntax stack instead of treating it as an append', async () => {
  const api = setup();
  await api.request('/*');
  const result = await api.request('/**/ const value = 1');
  assert.equal(result.error, null);
  assert.equal(api.calls[1].reset, true);
  assert.deepEqual(Array.from(api.calls[1].lines), ['/**/ const value = 1']);
});

test('oversized results are delivered but are not retained by cache or native sessions', async () => {
  const api = setup();
  const result = await api.request('x'.repeat(600000));
  assert.equal(result.error, null);
  assert.equal(result.lines[0][0].text.length, 600000);
  assert.equal(api.completedCodeCache.size, 0);
  assert.equal(api.highlightSessions.size, 0);
});
