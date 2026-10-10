import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const { tokensForLine } = loadUts('uni_modules/uni-ai-worker/utssdk/code-highlight.uts', ['tokensForLine'], { MarkdownToken: {} });
const span = (startIndex, endIndex, scopes = ['source.js']) => ({ startIndex, endIndex, scopes });
const textOf = tokens => tokens.map(token => token.text).join('');

test('native multiline comment and template ranges cannot truncate original text', () => {
  // These incomplete ranges were captured from the Android grammar on 2026-10-10.
  for (const [source, ranges] of [
    ['/* comment', [span(0, 4, ['source.js', 'comment.block.js', 'punctuation.definition.comment.js'])]],
    ['const text = `first', [span(0, 5, ['storage.type.js']), span(5, 13), span(13, 16, ['string.template.js'])]],
  ]) {
    const result = tokensForLine(source, { tokens: ranges });
    assert.equal(textOf(result), source);
    assert.equal(result.at(-1).className, '', 'unclassified tail keeps neutral styling');
  }
});
test('leading gaps, internal gaps and missing token lines preserve whitespace and Unicode', () => {
  const source = '  const value = "中文😀";  ';
  for (const parsed of [null, { tokens: [] }, { tokens: [span(2, 7, ['storage.type.js']), span(16, 20, ['string.quoted'])] }]) {
    assert.equal(textOf(tokensForLine(source, parsed)), source);
  }
  assert.equal(tokensForLine('', null).length, 0);
});
test('overlapping and out-of-bounds spans do not duplicate or lose source', () => {
  const source = 'const value';
  const result = tokensForLine(source, { tokens: [span(-5, 5), span(3, 8), span(7, 999), span(0, 2)] });
  assert.equal(textOf(result), source);
});
