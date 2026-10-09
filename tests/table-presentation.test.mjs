import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../uni_modules/uni-ai-worker/utssdk/markdown-html.uts', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '');
const api = vm.createContext({});
vm.runInContext(stripTypeScriptTypes(source), api);

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
