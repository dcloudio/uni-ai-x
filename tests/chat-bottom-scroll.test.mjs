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
  const message = { _id: 'm', body: 'initial', rendered: pendingPresentation };
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
  let stateChanged;
  const frames = new Map();
  let frameId = 0, frameTime = 0;
  const api = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) +
    '\nreturn { scrollToLastMsg, cancelBottomScroll, resumeDemoBottomScroll, startInternalDemo(mode = "smooth") { internalScrollMode = mode; internalDemoChatId = chatActiveId.value; startDemoBottomFollow(); } }; })()', {
    viewDisposed: false, chatActiveId, scrollTop, currentScrollTop: 0,
    uniAi, displayStates: new Map([['m', display]]),
    msgList: { value: [{}] }, state, watch: (_source, callback) => { stateChanged = callback; },
    computed: getter => ({ get value() { return getter(); } }), tr: text => text,
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
  const wait = async () => { api.frames(60); };
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

test('smooth follow approaches moving content over multiple frames and touch stops all motion', async () => {
  const api = controller();
  try {
    api.startInternalDemo();
    api.frames(2);
    assert.ok(api.layout.top > 0 && api.layout.top < 500);
    api.layout.height = 4000;
    api.message.body += ' output during animation';
    api.frames(60);
    assert.equal(api.layout.top, 3500);
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

test('constant reading speed is independent of backlog and survives native pixel rounding', () => {
  for (const height of [1000, 8000]) {
    const api = controller(false, true);
    try {
      api.layout.height = height;
      api.startInternalDemo('constant');
      api.frames(60);
      assert.ok(Math.abs(api.layout.top - 200 * 0.960) < 0.3);
      api.layout.height += 1000;
      api.message.body += ' faster output';
      api.frames(60);
      assert.ok(Math.abs(api.layout.top - 200 * 1.920) < 0.3);
    } finally {
      api.cancelBottomScroll();
    }
  }
});

test('constant mode waits for content, resumes after touch, and drains completed output before stopping', () => {
  const api = controller(false, true);
  try {
    api.layout.height = 500;
    api.startInternalDemo('constant');
    api.frames(60);
    assert.equal(api.commands.length, 0);
    api.layout.height = 1500;
    api.frames(60);
    assert.ok(api.layout.top > 185 && api.layout.top < 200);
    api.cancelBottomScroll();
    const heldTop = api.layout.top;
    api.setState('completed');
    api.frames(60);
    assert.equal(api.layout.top, heldTop);
    api.resumeDemoBottomScroll();
    api.frames(400);
    assert.equal(api.layout.top, 1000);
    const count = api.commands.length;
    api.layout.height += 500;
    api.frames(60);
    assert.equal(api.commands.length, count);
  } finally {
    api.cancelBottomScroll();
  }
});

test('original instant follow remains selectable', async () => {
  const instant = controller();
  try {
    instant.startInternalDemo('instant');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(instant.layout.top, 2500);
    instant.layout.height += 500;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(instant.layout.top, 3000);
  } finally {
    instant.cancelBottomScroll();
  }
});

test('completion settles the final layout once and stop never restarts following', async () => {
  for (const terminal of ['completed', 'stop']) {
    const api = controller();
    try {
      api.startInternalDemo();
      api.frames(60);
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
