import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function harness(state = 'processing', empty = false) {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/sdk/index.uts', import.meta.url), 'utf8');
  const methods = source.slice(source.indexOf('\taddChat('), source.indexOf('\n\tdeleteChat('))
    + source.slice(source.indexOf('\tselectChat('), source.indexOf('\n\tprepareMessagePresentation('));
  const ticks = [];
  const old = { id: 'old', state, msgList: empty ? [] : [{ _id: 'reply', rendered: false }] };
  const api = vm.runInNewContext(stripTypeScriptTypes(`new (class { ${methods} })()`), {
    reactive: value => value, nextTick: fn => ticks.push(fn), console, Date,
  });
  Object.assign(api, {
    chat: { activeId: 'old', datas: [old] }, loadedChatIds: ['old'], answerGeneration: 10,
    storageLoading: false, aborts: 0, saves: 0,
    cancelEditMsg() {}, getLocalMsgId: () => 'new',
    saveChatList2Storage() { this.saves++; },
    loadChatMessages: () => Promise.resolve(), prepareMessagePresentation() {},
    abortRequest() { this.aborts++; this.currentChat.state = 'stop'; this.currentChat.msgList.at(-1).rendered = true; this.answerGeneration++; },
  });
  Object.defineProperty(api, 'currentChat', { get: () => api.chat.datas.find(chat => chat.id === api.chat.activeId) });
  return { api, old, tick: () => ticks.splice(0).forEach(fn => fn()) };
}

test('opening a new chat cancels the old generation before switching and finalizes its reply', () => {
  const h = harness();
  h.api.addChat();
  h.tick();
  assert.equal(h.api.aborts, 1);
  assert.equal(h.old.state, 'stop');
  assert.equal(h.old.msgList[0].rendered, true);
  assert.equal(h.api.chat.activeId, 'new');
  assert.equal(h.api.currentChat.state, 'none');
  assert.equal(h.api.answerGeneration, 11);
  h.api.selectChat('old');
  assert.equal(h.api.currentChat.state, 'stop');
});

test('reusing an already active empty chat does not cancel or invalidate a generation', () => {
  const h = harness('none', true);
  h.api.addChat(); h.tick();
  assert.equal(h.api.chat.datas.length, 1);
  assert.equal(h.api.chat.activeId, 'old');
  assert.equal(h.api.aborts, 0);
  assert.equal(h.api.answerGeneration, 10);
});

test('completed-chat navigation invalidates stale callbacks without aborting a completed reply', () => {
  const h = harness('completed');
  h.api.addChat(false); h.tick();
  assert.equal(h.api.aborts, 0);
  assert.equal(h.old.state, 'completed');
  assert.equal(h.api.answerGeneration, 11);
});

test('reusing another empty chat still stops the currently generating chat', () => {
  const h = harness();
  h.api.chat.datas.unshift({ id: 'empty', state: 'none', msgList: [] });
  h.api.loadedChatIds.push('empty');
  h.api.addChat(); h.tick();
  assert.equal(h.api.chat.datas.length, 2);
  assert.equal(h.api.chat.activeId, 'empty');
  assert.equal(h.old.state, 'stop');
  assert.equal(h.api.aborts, 1);
});
