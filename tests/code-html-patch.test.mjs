import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';
const { buildCodeHtmlPatch } = loadUts('uni_modules/uni-ai-worker/utssdk/code-presentation.uts', ['buildCodeHtmlPatch']);
const row = html => ({ text: '', html });

test('prepared HTML patches preserve append, recolor, shrink and clear semantics', () => {
  let previous = [], html = '';
  const stable = row('<span>const</span> value = &quot;中文😀&quot;');
  for (const lines of [[stable], [stable, row('tail')], [stable, row('<span style="color:red">tail</span>')], [stable], []]) {
    const patch = buildCodeHtmlPatch(lines, previous);
    html = html.slice(0, patch.prefixLength) + patch.html;
    assert.equal(html, buildCodeHtmlPatch(lines, []).html);
    previous = lines;
  }
});
test('a changed first row invalidates the whole prefix and equal HTML can reuse it', () => {
  const previous = [row('one'), row('two')];
  assert.equal(buildCodeHtmlPatch([row('changed'), row('two')], previous).prefixLength, 0);
  const same = buildCodeHtmlPatch([row('one'), row('two')], previous);
  assert.equal(same.html, '');
  assert.equal(same.prefixLength, buildCodeHtmlPatch(previous, []).html.length);
});
