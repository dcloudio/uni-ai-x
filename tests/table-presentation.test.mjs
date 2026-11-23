import assert from 'node:assert/strict';
import { loadUts } from './uts-loader.mjs';
import test from 'node:test';

const api = loadUts('uni_modules/uni-ai-x/utssdk/worker/markdown-html.uts', ['markdownTableNaturalHeight'], { Number: Object.assign(value => Number(value), { from: value => Number(value) }) });

test('nowrap table height follows actual rows instead of simulated text wrapping', () => {
  const cell = 'Very long text '.repeat(100);
  const html = '<table><tr><th>Title</th></tr><tr><td>' + cell + '</td></tr></table>';
  assert.equal(api.markdownTableNaturalHeight(html), 70);
  assert.equal(api.markdownTableNaturalHeight(html.replace(cell, 'line1<br/>line2<br>line3')), 114);
});

test('each row uses the tallest cell and an empty table keeps a minimum height', () => {
  assert.equal(api.markdownTableNaturalHeight('<table><tr><td>a<br>b</td><td>c</td></tr></table>'), 57);
  assert.equal(api.markdownTableNaturalHeight('<table></table>'), 35);
});
