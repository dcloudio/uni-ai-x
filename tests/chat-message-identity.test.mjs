import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function rowsHarness() {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-chat.uvue', import.meta.url), 'utf8');
  const source = full.slice(full.indexOf('\tconst messageComputations ='), full.indexOf('\n\tconst lastMsg ='));
  // Verified in HBuilderX 5.38's emitted Web module: for-of const becomes var.
  // Re-evaluate lazy rows after the loop, as Vue does when dependencies change.
  const lowered = stripTypeScriptTypes(source).replace('for (const msg of', 'for (var msg of');
  const messages = { value: [
    { _id: 'user-1', body: 'question-1' }, { _id: 'ai-1', body: 'answer-1' },
    { _id: 'user-2', body: 'question-2' }, { _id: 'ai-2', body: 'answer-2' },
  ] };
  const api = vm.runInNewContext(`(() => { ${lowered}
    return { rows: () => renderItemList.value,
      invalidate: () => [...messageComputations.values()].flatMap(entry => entry.rows.value) };
  })()`, {
    msgList: messages,
    computed: read => ({ get value() { return read(); } }),
    buildMessageRows: msg => [{ key: msg._id, body: msg.body }],
  });
  return { messages, ...api };
}

test('invalidated rows retain message identity after a lowered for-of loop finishes', () => {
  const h = rowsHarness();
  h.rows();
  assert.deepEqual(Array.from(h.invalidate(), row => row.key), ['user-1', 'ai-1', 'user-2', 'ai-2']);
});

test('regenerating a later answer cannot overwrite earlier answers', () => {
  const h = rowsHarness();
  h.rows();
  h.messages.value[3].body = 'regenerated';
  assert.deepEqual(Array.from(h.invalidate(), row => row.body), ['question-1', 'answer-1', 'question-2', 'regenerated']);
});

test('append and replacement keep distinct keys and correct bodies across repeated rounds', () => {
  const h = rowsHarness();
  for (let round = 3; round <= 6; round++) {
    h.rows();
    h.messages.value.push({ _id: `user-${round}`, body: `question-${round}` }, { _id: `ai-${round}`, body: `answer-${round}` });
    h.rows();
    const rows = h.invalidate();
    assert.equal(new Set(rows.map(row => row.key)).size, h.messages.value.length);
    assert.deepEqual(Array.from(rows, row => row.body), h.messages.value.map(msg => msg.body));
  }
  h.messages.value[1] = { _id: 'ai-1', body: 'restored-answer-1' };
  h.rows();
  assert.equal(h.invalidate()[1].body, 'restored-answer-1');
});
