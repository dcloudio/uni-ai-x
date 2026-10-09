import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function setup() {
  const tasks = [], timers = [], calls = [];
  const { ProxyWeb } = loadUts('uni_modules/uni-ai-x/sdk/proxy-web.uts', ['ProxyWeb'], {
    utils: { runOnDispatcher: (_thread, fn) => tasks.push(fn) },
    setTimeout: fn => timers.push(fn), console: { log() {} },
  });
  const proxy = new ProxyWeb();
  const drain = () => { while (tasks.length) tasks.shift()(); };
  const mount = () => { proxy.init({ evalJS: code => calls.push(code) }); proxy.markReady(); };
  return { proxy, drain, mount, timers, calls };
}

test('first rendering request mounts lazily; release invalidates waiting retries', () => {
  const api = setup();
  let mounts = 0;
  api.proxy.setEnsureHandler(() => mounts++);
  assert.equal(mounts, 0);
  api.proxy.callMethod({ action: 'renderMermaid' }, () => {});
  api.drain();
  assert.equal(mounts, 1);
  api.proxy.release();
  api.timers.shift()();
  api.drain();
  assert.equal(mounts, 1);
  assert.equal(api.calls.length, 0);
});

test('release blocks already dispatched JS and callbacks from a previous session', () => {
  const api = setup();
  api.mount();
  api.proxy.callMethod({ action: 'renderMermaid' }, () => {});
  api.proxy.release();
  api.drain();
  assert.equal(api.calls.length, 0);
  assert.equal(api.proxy.callbackMap.size, 0);
  api.mount();
  let completed = 0;
  api.proxy.callMethod({ action: 'renderMermaid' }, () => completed++);
  api.drain();
  const key = [...api.proxy.callbackMap.keys()][0];
  api.proxy.emitMsg({ action: key, param: {} });
  api.proxy.release();
  api.drain();
  assert.equal(completed, 0);
});

test('unmounted hosts ignore delayed readiness and new requests notify the active host', () => {
  const api = setup();
  let requests = 0;
  api.proxy.setRequestListener(() => requests++);
  api.mount();
  api.proxy.callMethod({ action: 'renderMermaid' }, () => {});
  assert.equal(requests, 1);
  api.proxy.release();
  api.proxy.setEnsureHandler(null);
  api.proxy.setRequestListener(null);
  api.proxy.emitMsg({ action: 'DOMContentLoaded_callback' });
  assert.equal(api.proxy.isInit, false);
});
