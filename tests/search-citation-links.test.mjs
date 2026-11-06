import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const { linkSearchCitations } = loadUts('uni_modules/uni-ai-worker/utssdk/presentation-links.uts',
  ['linkSearchCitations']);

test('citation links preserve the text before each reference', () => {
  const html = '<ul><li>敏捷开发强调迭代交付 [4]。</li><li>另一项说明 [7]。</li></ul>';
  const linked = linkSearchCitations(html, [4, 7]);
  assert.match(linked, /<li>敏捷开发强调迭代交付 <a href="#uni-ai-source-4"[^>]*>\[4\]<\/a>。<\/li>/);
  assert.match(linked, /<li>另一项说明 <a href="#uni-ai-source-7"[^>]*>\[7\]<\/a>。<\/li>/);
});

test('adjacent citations and unrelated references keep their surrounding text', () => {
  const linked = linkSearchCitations('<p>结论 [4][7]，参考 [9]。</p>', [4, 7]);
  assert.match(linked, /<p>结论 <a href="#uni-ai-source-4"[^>]*>\[4\]<\/a><a href="#uni-ai-source-7"[^>]*>\[7\]<\/a>，参考 \[9\]。<\/p>/);
});
