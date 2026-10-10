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
    ['requestCachedCodeText', 'releaseCodeHighlightSessions'], {
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

test('concurrent requests for one block serialize and reuse the completed prefix', async () => {
  const api = setup();
  const results = await Promise.all([api.request('one'), api.request('one\ntwo'), api.request('one\ntwo\nthree')]);
  assert.ok(results.every(result => result.error == null));
  assert.deepEqual(api.calls.map(call => Array.from(call.lines)), [['one'], ['two'], ['three']]);
  api.releaseCodeHighlightSessions('m');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.states.size, 0);
  assert.equal(api.released.length, 1);
});

test('changing the last line resets the syntax stack instead of treating it as an append', async () => {
  const api = setup();
  await api.request('/*');
  const result = await api.request('/**/ const value = 1');
  assert.equal(result.error, null);
  assert.equal(api.calls[1].reset, true);
  assert.deepEqual(Array.from(api.calls[1].lines), ['/**/ const value = 1']);
});
