import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function controller(pendingPresentation = false) {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-chat.uvue', import.meta.url), 'utf8');
  const source = full.slice(full.indexOf('let bottomScrollVersion'), full.indexOf('\n\tfunction clearTimer'))
    .replace(/\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '');
  const message = { _id: 'm', body: 'initial', rendered: pendingPresentation };
  const display = { final: pendingPresentation ? null : {} };
  const layout = { height: 1000, top: 0 }, chatActiveId = { value: 'chat' };
  const commands = [];
  const scrollTop = { set value(top) {
    commands.push(top); layout.top = top;
    // The first jump mounts virtual items whose true height exceeds the estimate.
    if (top === 500) layout.height = 3000;
  } };
  const uniAi = { lastAiMsg: message };
  const api = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) +
    '\nreturn { scrollToLastMsg, cancelBottomScroll }; })()', {
    viewDisposed: false, chatActiveId, scrollTop, currentScrollTop: 0,
    uniAi, displayStates: new Map([['m', display]]),
    msgList: { value: [{}] }, setIsInScrollBottom() {}, nextTick: () => Promise.resolve(), setTimeout,
    uni: { getElementById: () => ({ get scrollHeight() { return layout.height; },
      get scrollTop() { return layout.top; }, getBoundingClientRect: () => ({ height: 500 }) }) },
  });
  return { ...api, layout, chatActiveId, commands, message, display, uniAi };
}

test('one click reaches the corrected virtual bottom and later output does not follow', async () => {
  const api = controller();
  await api.scrollToLastMsg();
  assert.equal(api.layout.top, 2500);
  api.layout.height = 5000;
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(api.layout.top, 2500);
  await api.scrollToLastMsg();
  assert.equal(api.layout.top, 4500);
});

test('touch or chat changes cancel an outstanding click before another scroll command', async () => {
  for (const reason of ['touch', 'chat']) {
    const api = controller();
    const pending = api.scrollToLastMsg();
    if (reason === 'touch') api.cancelBottomScroll();
    else api.chatActiveId.value = 'other';
    await pending;
    assert.equal(api.commands.length, 0);
  }
});


test('a completed reply waits for delayed image commits within the same click', async () => {
  const api = controller(true);
  setTimeout(() => { api.layout.height = 4000; api.display.final = {}; }, 120);
  await api.scrollToLastMsg();
  assert.equal(api.layout.top, 3500);
});

test('new output cancels presentation correction instead of turning into auto-follow', async () => {
  const api = controller(true);
  setTimeout(() => { api.message.body += ' new output'; }, 70);
  await api.scrollToLastMsg();
  const top = api.layout.top;
  api.layout.height += 500;
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(api.layout.top, top);
});

test('a new last message cancels the old click', async () => {
  const api = controller(true);
  setTimeout(() => { api.uniAi.lastAiMsg = { _id: 'new', body: '', rendered: false }; }, 70);
  await api.scrollToLastMsg();
  assert.equal(api.display.final, null);
});
