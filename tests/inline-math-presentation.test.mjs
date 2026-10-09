import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const source = 'data:image/svg+xml;base64,PHN2Zy8+';
const formula = `<img class="math" style="vertical-align:-1px" src="${source}">`;
const block = (html = `<p>formula: ${formula}</p>`, kind = 'html') => ({ key: 'one', kind, html });
function setup(flags) {
  const calls = [];
  let generation = 0;
  const { prepareNativeInlineMathBlocks: prepare } = loadUts('uni_modules/uni-ai-x/sdk/inline-math-presentation.uts', ['prepareNativeInlineMathBlocks'], {
    proxyWeb: { getGeneration: () => generation, callMethod: (request, callback) => calls.push({ request, callback }) },
  }, flags);
  return { calls, prepare, release: () => generation++ };
}
const result = { imageDataURL: 'data:image/png;base64,png', width: 62, height: 14 };

test('native formula pictures use lazy raster fallback and preserve surrounding HTML', () => {
  const api = setup();
  const current = block();
  let changes = 0;
  api.prepare('m', [current], 'light', () => changes++);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].request.source, source);
  assert.equal(api.calls[0].request.action, 'rasterizeInlineMath');
  api.calls[0].callback(result);
  assert.equal(current.html, `<p>formula: <img class="math" style="vertical-align:-1px" src="${result.imageDataURL}" width="62" height="14"></p>`);
  assert.equal(changes, 1);
  const cached = block();
  api.prepare('m', [cached], 'light', () => changes++);
  assert.equal(cached.html, current.html);
  assert.equal(api.calls.length, 1);
});

test('streaming supersedes old callbacks and repeated pictures keep their distinct styles', () => {
  const api = setup();
  const old = block();
  const next = block(`<p>${formula}${formula.replace('-1px', '-2px')}tail</p>`);
  api.prepare('m', [old], 'light', () => assert.fail('obsolete callback'));
  api.prepare('m', [next], 'light', () => {});
  assert.equal(api.calls.length, 1);
  api.calls[0].callback(result);
  assert.ok(old.html.includes(source));
  assert.equal((next.html.match(/data:image\/png/g) ?? []).length, 2);
  assert.ok(next.html.endsWith('tail</p>'));
});

test('session release discards in-flight results; theme and new sessions request fresh pictures', () => {
  const api = setup();
  const old = block();
  api.prepare('m', [old], 'light', () => assert.fail('released callback'));
  api.release();
  api.calls[0].callback(result);
  assert.ok(old.html.includes(source));
  api.prepare('m', [block()], 'light', () => {});
  api.prepare('m', [block()], 'dark', () => {});
  assert.equal(api.calls.length, 3);
});

test('plain text, ordinary images, code and block formulas do not create a WebView request', () => {
  const api = setup();
  api.prepare('m', [block('<p>text</p>'), block(formula.replace('class="math"', 'class="photo"')), block(formula, 'code'), block(formula, 'math')], 'light', () => {});
  assert.equal(api.calls.length, 0);
  api.prepare('m', [block(`<table><tr><td>${formula}</td></tr></table>`, 'table')], 'light', () => {});
  assert.equal(api.calls.length, 1);
  for (const platform of ['APP-HARMONY', 'WEB', 'APP-IOS']) {
    const other = setup([platform]);
    other.prepare('m', [block()], 'light', () => {});
    assert.equal(other.calls.length, 0);
  }
});

test('failed fallback preserves native output and permits a later retry', () => {
  const api = setup();
  const current = block();
  api.prepare('m', [current], 'light', () => assert.fail('failure callback'));
  api.calls[0].callback({ imageDataURL: '' });
  assert.ok(current.html.includes(source));
  api.prepare('m', [current], 'light', () => {});
  assert.equal(api.calls.length, 2);
});

test('asynchronous results update every matching block without touching later unrelated content', () => {
  const api = setup();
  const first = block();
  const second = { ...block(), key: 'two' };
  const last = { ...block('<p>footer</p>'), key: 'last' };
  api.prepare('m', [first, second, last], 'light', () => {});
  assert.equal(api.calls.length, 1);
  api.calls[0].callback(result);
  assert.ok(first.html.includes(result.imageDataURL));
  assert.ok(second.html.includes(result.imageDataURL));
  assert.equal(last.html, '<p>footer</p>');
});
