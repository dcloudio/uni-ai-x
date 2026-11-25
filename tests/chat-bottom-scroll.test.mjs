import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function controller(pendingPresentation = false, quantizedScroll = false) {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-chat.uvue', import.meta.url), 'utf8');
  const source = full.slice(full.indexOf('let bottomScrollVersion'), full.indexOf('\n\tfunction clearTimer'))
    .replace(/\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
    + full.slice(full.indexOf('\twatch(state,'), full.indexOf('\n\tfunction resetScrollStateForEmptyChat'));
  const message = { _id: 'm', from_uid: 'uni-ai', body: 'initial', rendered: pendingPresentation };
  const msgList = { value: [{ _id: 'user', from_uid: 'user' }, message] };
  const display = { final: pendingPresentation ? null : {} };
  const layout = { height: 1000, top: 0 }, chatActiveId = { value: 'chat' };
  const commands = [];
  const scrollTop = { set value(top) {
    commands.push(top); layout.top = quantizedScroll ? Math.round(top * 3.5) / 3.5 : top;
    // The first jump mounts virtual items whose true height exceeds the estimate.
    if (top >= 500 && layout.height === 1000) layout.height = 3000;
  } };
  const uniAi = { lastAiMsg: message };
  const state = { value: 'processing' };
  let stateChanged, userMessageChanged;
  const frames = new Map();
  let frameId = 0, frameTime = 0;
  const api = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) +
    '\nreturn { scrollToLastMsg, cancelBottomScroll, resumeBottomFollow, startFollow() { followChatId = chatActiveId.value; startBottomFollow(); }, setNavigatingStreaming(value) { enteredStreamingChat = value; } }; })()', {
    viewDisposed: false, chatActiveId, scrollTop, currentScrollTop: 0,
    uniAi, displayStates: new Map([['m', display]]),
    msgList, state, watch: (source, callback) => {
      if (source === state) stateChanged = callback;
      else userMessageChanged = callback;
    },
    computed: getter => ({ get value() { return getter(); } }), tr: text => text,
    hasMessageRenderTasks: () => false,
    setIsInScrollBottom() {}, nextTick: () => Promise.resolve(), setTimeout, setInterval, clearInterval,
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    uni: { getElementById: () => ({ get scrollHeight() { return layout.height; },
      get scrollTop() { return layout.top; }, getBoundingClientRect: () => ({ height: 500 }) }) },
  });
  return { ...api, layout, chatActiveId, commands, message, display, uniAi,
    frames(count) {
      for (let i = 0; i < count; i++) {
        frameTime += 16;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(callback => callback(frameTime));
      }
    },
    setState(value) { state.value = value; stateChanged(value); },
    sendUserMessage(id = 'user-2') {
      msgList.value.splice(msgList.value.length - 1, 0, { _id: id, from_uid: 'user' });
      return userMessageChanged(id);
    } };
}

test('sending a user message jumps to the true bottom while later output retains the reading buffer', async () => {
  const api = controller();
  try {
    api.layout.height = 3500;
    api.setState('processing');
    await api.sendUserMessage();
    assert.equal(api.layout.top, 3000);
    api.layout.height += 1000;
    api.message.body += ' subsequent reply';
    api.frames(60);
    assert.ok(Math.abs(api.layout.top - (4000 - 500 / 3)) <= 1);
    api.cancelBottomScroll();
    const held = api.layout.top;
    api.layout.height += 1000;
    api.frames(30);
    assert.equal(api.layout.top, held);
  } finally { api.cancelBottomScroll(); }
});

test('new sends restore visibility after interruption but streaming navigation does not jump', async () => {
  const api = controller();
  try {
    api.layout.height = 3500;
    api.setState('processing');
    api.cancelBottomScroll();
    await api.sendUserMessage();
    assert.equal(api.layout.top, 3000);
    const count = api.commands.length;
    api.setNavigatingStreaming(true);
    await api.sendUserMessage('loaded-history');
    assert.equal(api.commands.length, count);
  } finally { api.cancelBottomScroll(); }
});

test('a fast first reply chunk cannot cancel the initial send jump', async () => {
  const api = controller();
  try {
    api.layout.height = 3500;
    api.setState('processing');
    const pending = api.scrollToLastMsg(true);
    api.message.body += ' first chunk before layout tick';
    await pending;
    assert.equal(api.layout.top, 3000);
  } finally { api.cancelBottomScroll(); }
});

test('switching chats cancels a queued send jump before it issues scroll commands', async () => {
  const api = controller();
  const pending = api.sendUserMessage();
  api.chatActiveId.value = 'other-chat';
  await pending;
  assert.equal(api.commands.length, 0);
});

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

test('buffered follow tracks height changes and allows repeated interruption and explicit resumption', async () => {
  const api = controller();
  const wait = async () => { api.frames(60); };
  try {
    api.layout.height = 3000;
    api.startFollow();
    await wait();
    assert.ok(Math.abs(api.layout.top - (2500 - 500 / 3)) <= 1);
    for (let i = 0; i < 2; i++) {
      api.cancelBottomScroll();
      const heldTop = api.layout.top;
      api.message.body += ' more output';
      api.layout.height += 500;
      await wait();
      assert.equal(api.layout.top, heldTop);
      api.resumeBottomFollow();
      await wait();
      assert.ok(Math.abs(api.layout.top - (api.layout.height - 500 - 500 / 3)) <= 1);
      api.message.body += ' continuing output';
      api.layout.height += 500;
      await wait();
      assert.ok(Math.abs(api.layout.top - (api.layout.height - 500 - 500 / 3)) <= 1);
    }
  } finally {
    api.cancelBottomScroll();
  }
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

test('buffered follow approaches moving content over multiple frames and touch stops all motion', async () => {
  const api = controller();
  try {
    api.startFollow();
    api.frames(2);
    assert.ok(api.layout.top > 0 && api.layout.top < 500);
    api.layout.height = 4000;
    api.message.body += ' output during animation';
    api.frames(60);
    assert.ok(Math.abs(api.layout.top - (3500 - 500 / 3)) <= 1);
    assert.ok(api.commands.filter(top => top > 500 && top < 3500).length > 3);
    api.cancelBottomScroll();
    const count = api.commands.length;
    api.layout.height += 500;
    api.frames(10);
    assert.equal(api.commands.length, count);
  } finally {
    api.cancelBottomScroll();
  }
});

test('default follow keeps a third-screen buffer and settles smoothly only after completed layout stabilizes', () => {
  const api = controller();
  try {
    api.layout.height = 3500;
    api.setState('processing');
    api.frames(60);
    assert.ok(Math.abs(api.layout.top - (3000 - 500 / 3)) <= 1);
    api.message.body += ' more output';
    api.layout.height += 500;
    api.frames(60);
    assert.ok(Math.abs(api.layout.top - (3500 - 500 / 3)) <= 1);
    api.setState('completed');
    api.frames(5);
    assert.ok(api.layout.top < 3500);
    // Completion state arrives before the final rendered callback in the real runner.
    api.message.rendered = true;
    api.frames(60);
    assert.ok(Math.abs(api.layout.top - 3500) <= 1);
    const count = api.commands.length;
    api.frames(10);
    assert.equal(api.commands.length, count);
  } finally {
    api.cancelBottomScroll();
  }
});

test('interrupting default follow prevents output and completion from resuming motion', () => {
  const api = controller();
  try {
    api.setState('processing');
    api.frames(10);
    api.cancelBottomScroll();
    const count = api.commands.length;
    api.layout.height += 1000;
    api.message.body += ' new output';
    api.frames(30);
    api.setState('completed');
    api.frames(30);
    assert.equal(api.commands.length, count);
  } finally {
    api.cancelBottomScroll();
  }
});

test('completion drains the final buffer and stop never restarts following', () => {
  for (const terminal of ['completed', 'stop']) {
    const api = controller();
    try {
      api.layout.height = 3000;
      api.startFollow();
      api.frames(60);
      const held = api.layout.top;
      api.layout.height += 500;
      api.message.rendered = true;
      api.setState(terminal);
      api.frames(60);
      assert.ok(Math.abs(api.layout.top - (terminal === 'completed' ? 3000 : held)) <= 1);
      const finalTop = api.layout.top;
      api.layout.height += 500;
      api.frames(60);
      assert.equal(api.layout.top, finalTop);
    } finally { api.cancelBottomScroll(); }
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

function initialController() {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-chat.uvue', import.meta.url), 'utf8');
  const source = full.slice(full.indexOf('async function positionInitialHistory'), full.indexOf('\n\tlet bottomScrollVersion'));
  const commands = [], timers = [];
  const context = {
    bottomScrollVersion: 0, viewDisposed: false, chatActiveId: { value: 'chat' },
    state: { value: 'completed' },
    initialPositioning: { value: true }, nextTick: () => Promise.resolve(),
    setTimeout: callback => timers.push(callback),
    console: { log() {} },
    scrollTop: { set value(top) { commands.push(top); } },
    uni: { getElementById: () => ({ scrollHeight: commands.length === 0 ? 1000 : 3000,
      getBoundingClientRect: () => ({ height: 500 }) }) },
  };
  const run = vm.runInNewContext(stripTypeScriptTypes(source) + ';positionInitialHistory', context);
  const tick = async () => { await Promise.resolve(); timers.shift()?.(); await Promise.resolve(); };
  return { context, commands, timers, run, tick };
}

test('initial positioning reveals corrected history within a fixed budget without waiting for resources', async () => {
  const api = initialController();
  const pending = api.run('chat');
  for (let i = 0; i < 20 && api.context.initialPositioning.value; i++) await api.tick();
  await pending;
  assert.equal(api.context.initialPositioning.value, false);
  assert.equal(api.commands.at(-1), 2500);
  assert.equal(api.timers.length, 0);
  const count = api.commands.length;
  await api.tick();
  assert.equal(api.commands.length, count);
});

test('touch cancels initial correction and reveals history without issuing another jump', async () => {
  const api = initialController();
  const pending = api.run('chat');
  api.context.bottomScrollVersion++;
  for (let i = 0; i < 20 && api.context.initialPositioning.value; i++) await api.tick();
  await pending;
  assert.equal(api.commands.length, 0);
  assert.equal(api.context.initialPositioning.value, false);
});
