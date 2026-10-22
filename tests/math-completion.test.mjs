import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const { nativeRenderBlock } = loadUts(
  'uni_modules/uni-ai-worker/utssdk/native-presentation.uts',
  ['nativeRenderBlock'],
);

const block = (kind, isComplete) => ({
  kind,
  key: kind + '-0',
  html: '',
  text: 'x^2',
  language: kind,
  isComplete,
  columnWidths: [],
  rowTextWidths: [],
  svgSource: '',
  svgWidth: 0,
  svgHeight: 0,
});

test('message completion does not prematurely complete a math block', () => {
  assert.equal(nativeRenderBlock(block('math', false), true).isComplete, false);
  assert.equal(nativeRenderBlock(block('math', true), false).isComplete, true);
  assert.equal(nativeRenderBlock(block('code', false), true).isComplete, true);
});
