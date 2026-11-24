import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function controller(pendingPresentation = false) {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-chat.uvue', import.meta.url), 'utf8');
  const source = full.slice(full.indexOf('let bottomScrollVersion'), full.indexOf('\n\tfunction clearTimer'))
    .replace(/\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
    + full.slice(full.indexOf('\twatch(state,'), full.indexOf('\n\tfunction resetScrollStateForEmptyChat'));
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
  const state = { value: 'processing' };
  let stateChanged;
  const api = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) +
    '\nreturn { scrollToLastMsg, cancelBottomScroll, resumeDemoBottomScroll, startInternalDemo() { internalDemoChatId = chatActiveId.value; startDemoBottomFollow(); } }; })()', {
    viewDisposed: false, chatActiveId, scrollTop, currentScrollTop: 0,
    uniAi, displayStates: new Map([['m', display]]),
    msgList: { value: [{}] }, state, watch: (_source, callback) => { stateChanged = callback; },
    setIsInScrollBottom() {}, nextTick: () => Promise.resolve(), setTimeout, setInterval, clearInterval,
    uni: { getElementById: () => ({ get scrollHeight() { return layout.height; },
      get scrollTop() { return layout.top; }, getBoundingClientRect: () => ({ height: 500 }) }) },
  });
  return { ...api, layout, chatActiveId, commands, message, display, uniAi,
    setState(value) { state.value = value; stateChanged(value); } };
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

test('internal demo follows height changes and allows repeated interruption and explicit resumption', async () => {
  const api = controller();
  const wait = () => new Promise(resolve => setTimeout(resolve, 240));
  try {
    api.startInternalDemo();
    await wait();
    assert.equal(api.layout.top, 2500);
    for (let i = 0; i < 2; i++) {
      api.cancelBottomScroll();
      const heldTop = api.layout.top;
      api.message.body += ' more output';
      api.layout.height += 500;
      await wait();
      assert.equal(api.layout.top, heldTop);
      api.resumeDemoBottomScroll();
      await wait();
      assert.equal(api.layout.top, api.layout.height - 500);
      api.message.body += ' continuing output';
      api.layout.height += 500;
      await wait();
      assert.equal(api.layout.top, api.layout.height - 500);
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

test('completion settles the final layout once and stop never restarts following', async () => {
  for (const terminal of ['completed', 'stop']) {
    const api = controller();
    try {
      api.startInternalDemo();
      await new Promise(resolve => setTimeout(resolve, 200));
      api.layout.height += 500;
      api.setState(terminal);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(api.layout.top, terminal === 'completed' ? 3000 : 2500);
      const finalTop = api.layout.top;
      api.layout.height += 500;
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(api.layout.top, finalTop);
    } finally {
      api.cancelBottomScroll();
    }
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
