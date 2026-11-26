import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { loadUts } from './uts-loader.mjs';

function component(path, props, exports) {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/' + path, import.meta.url), 'utf8');
  const source = full.slice(full.indexOf('<script'), full.indexOf('</script>')).replace(/^<script[^>]*>/, '')
    .replace(/^\s*import[^\n]+\n/gm, '');
  return vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) + '\nreturn {' + exports.join(',') + '};})()', {
    defineProps: () => props, withDefaults: (value, defaults) => Object.assign(defaults, value),
    ref: value => ({ value }), computed: getter => ({ get value() { return getter(); } }),
    watch() {}, onUnmounted() {}, onRecycle() {}, onReuse() {}, nextTick: callback => callback(), setTimeout: () => 1, clearTimeout() {},
    uiTheme: { value: 'light' }, mathWindowWidth: { value: 390 }, scrollDiagnostic() {},
    useMessageRenderTask() {}, tr: text => text,
    uni: { getWindowInfo: () => ({ windowWidth: 390 }) },
    ...loadUts('uni_modules/uni-ai-x/sdk/image-layout.uts', ['mermaidPreviewStyle']),
  });
}

const math = props => component('uni-ai-msg-math/uni-ai-msg-math.uvue', props,
  ['mathRootStyle', 'mathContentStyle', 'showMathPlaceholder', 'syncMathImageTheme', 'onMathBufferLoad']);

test('prepared formula geometry survives initial load and recycled image instances', () => {
  const props = { messageId: 'm', renderKey: 'f', isClose: 1, svgSource: '/formula.svg', svgWidth: 180, svgHeight: 84, text: 'source' };
  const first = math(props);
  first.syncMathImageTheme();
  const before = [first.mathRootStyle.value, first.mathContentStyle.value];
  assert.equal(first.showMathPlaceholder.value, true);
  assert.match(before[1], /height:84px/);
  first.onMathBufferLoad(1);
  assert.equal(first.showMathPlaceholder.value, false);
  assert.deepEqual([first.mathRootStyle.value, first.mathContentStyle.value], before);
  const recycled = math(props);
  recycled.syncMathImageTheme();
  assert.equal(recycled.showMathPlaceholder.value, true);
  assert.deepEqual([recycled.mathRootStyle.value, recycled.mathContentStyle.value], before);
});

test('unknown formula stays compact regardless of source length; tiny results never shrink its slot', () => {
  const props = { text: 'x\n'.repeat(1000), isClose: 0 };
  const api = math(props);
  assert.match(api.mathContentStyle.value, /height:32px/);
  props.isClose = 1; props.svgSource = '/tiny.svg'; props.svgWidth = 20; props.svgHeight = 14;
  api.syncMathImageTheme();
  const before = [api.mathRootStyle.value, api.mathContentStyle.value];
  assert.match(before[1], /height:32px/);
  api.onMathBufferLoad(1);
  assert.deepEqual([api.mathRootStyle.value, api.mathContentStyle.value], before);
});

test('prepared diagram reserves preview geometry before image load and on remount', () => {
  const props = { identity: 'diagram', src: '/chart.svg', codeText: 'graph LR; A-->B', imageWidth: 206, imageHeight: 412 };
  const make = () => component('uni-ai-msg-mermaid.uvue', props,
    ['hasPreparedLayout', 'imageReady', 'imageStyle', 'onImageSettled', 'onImageFailed']);
  const first = make();
  assert.equal(first.hasPreparedLayout.value, true);
  assert.equal(first.imageReady.value, true);
  const style = first.imageStyle.value;
  first.onImageSettled();
  assert.equal(first.imageReady.value, true);
  assert.equal(first.imageStyle.value, style);
  const recycled = make();
  assert.equal(recycled.hasPreparedLayout.value, true);
  assert.equal(recycled.imageReady.value, true);
  assert.equal(recycled.imageStyle.value, style);
  recycled.onImageFailed();
  assert.equal(recycled.imageReady.value, false);
  recycled.onImageSettled();
  assert.equal(recycled.imageReady.value, true);
});
