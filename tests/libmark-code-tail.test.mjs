import assert from 'node:assert/strict';
import test from 'node:test';
import {loadUts} from './uts-loader.mjs';
const {LibmarkCodeTail} = loadUts('workers/libmark-code-tail.uts', ['LibmarkCodeTail']);
const event = (text='', op=2, language='javascript') => ({ops:[{op,kind:'html',index:0,unchanged:false,content:`<pre><code class="language-${language}">${text}</code></pre>\n`}]});
const content = e => e.ops.at(-1).content;

test('characters preview before newline; native line replaces preview without duplication', () => {
  const tail = new LibmarkCodeTail();
  tail.feed('```javascript\n', event());
  assert.match(content(tail.feed('c',null)), />c<\/code>/);
  assert.match(content(tail.feed('o',null)), />co<\/code>/);
  assert.equal(content(tail.feed('\n',event('co\n'))),content(event('co\n')));
  assert.match(content(tail.feed('n',null)), />co\nn<\/code>/);
});

test('multi-line chunks, escaped HTML, CRLF and closing fences retain native output', () => {
  const tail = new LibmarkCodeTail();
  assert.match(content(tail.feed('```js\na\n<b>&',event('a\n'))), /a\n&lt;b&gt;&amp;<\/code>/);
  tail.feed('\r\n',event('a\n&lt;b&gt;&amp;\n'));
  assert.equal(tail.feed('`',null),null);
  assert.equal(tail.feed('``',null),null);
  const closed=event('a\n&lt;b&gt;&amp;\n',3);
  assert.equal(content(tail.feed('\n',closed)),content(closed));
  assert.equal(tail.feed('normal paragraph',null),null);
});

test('does not preview unconfirmed blocks or Mermaid, and a new session has no old tail', () => {
  const tail = new LibmarkCodeTail();
  assert.equal(tail.feed('plain',null),null);
  tail.feed('\n```mermaid\n',event('',2,'mermaid'));
  assert.equal(tail.feed('graph TD',null),null);
  assert.equal(new LibmarkCodeTail().feed('new',null),null);
});

test('fence indentation is removed consistently with native code output', () => {
  const tail = new LibmarkCodeTail();
  tail.feed('  ```js\n',event());
  assert.match(content(tail.feed('  value',null)), />value<\/code>/);
  assert.match(content(tail.feed('\n  next',event('value\n'))), />value\nnext<\/code>/);
});
