import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function renderer() {
  const requests = [], timers = new Map();
  let sequence = 0;
  const api = loadUts('uni_modules/uni-ai-x/sdk/themed-svg.uts', ['renderMathSvgForTheme', 'renderMermaidSvgForTheme'], {
    utils: { runOnDispatcher: (_thread, callback) => callback() },
    getHarmonySvgWorkaroundConfig: () => ({ cacheVariant: 'test', rasterScale: 1, useFileSource: false }),
    prepareHarmonySvgImageSource: (source, _file, callback) => callback(source, true),
    readAndroidSvgCache: (_key, callback) => callback(null), writeAndroidSvgCache() {},
    proxyWeb: { getGeneration: () => 1, notifyRequest() {}, cancelMethod() {},
      callMethod(param, callback, current) { requests.push({ param, callback, current }); } },
    setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { ...api, requests, expire() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); } };
}

for (const method of ['renderMathSvgForTheme', 'renderMermaidSvgForTheme']) {
  test(method + ': shared request times out once and rejects a late result from the previous attempt', () => {
    const api = renderer(), results = [];
    api[method]('same source', 'light', value => results.push(value));
    api[method]('same source', 'light', value => results.push(value));
    assert.equal(api.requests.length, 1);
    const old = api.requests[0];
    api.expire();
    assert.equal(results.length, 2);
    assert.ok(results.every(result => result.imageSource === ''));
    assert.equal(old.current(), false);
    api[method]('same source', 'light', value => results.push(value));
    old.callback({ imageDataURL: 'stale.svg', width: 10, height: 10 });
    assert.equal(results.length, 2);
    api.requests[1].callback({ imageDataURL: 'current.svg', width: 20, height: 20 });
    assert.equal(results.at(-1).imageSource, 'current.svg');
    assert.equal(results.length, 3);
  });
}

test('native math and Mermaid failures settle as source and do not restart on refresh', () => {
  const active = new Set();
  let requests = 0, changes = 0;
  const fail = (_text, _theme, callback) => { requests++; callback({ imageSource: '', width: 0, height: 0 }); };
  const { prepareNativeMermaidBlocks } = loadUts('uni_modules/uni-ai-x/sdk/mermaid-presentation.uts', ['prepareNativeMermaidBlocks'], {
    beginMessageRenderTask: (_id, key) => { active.add(key); return 1; },
    finishMessageRenderTask: (_id, key) => active.delete(key),
    renderMathSvgForTheme: fail, renderMermaidSvgForTheme: fail,
  });
  const blocks = ['math', 'mermaid'].map(kind => ({ kind, key: kind, text: 'invalid', isComplete: true, svgSource: '' }));
  const changed = () => { changes++; };
  prepareNativeMermaidBlocks(blocks, 'light', changed, 'message');
  assert.equal(blocks[0].kind, 'data-text');
  assert.equal(blocks[1].mermaidRenderFailed, true);
  assert.equal(active.size, 0);
  prepareNativeMermaidBlocks(blocks, 'light', changed, 'message');
  assert.equal(requests, 2);
  assert.equal(changes, 2);
});
