import assert from 'node:assert/strict';
import test from 'node:test';
import {loadUts} from './uts-loader.mjs';
const {LibmarkSourceTail: LibmarkCodeTail} = loadUts('workers/libmark-source-tail.uts', ['LibmarkSourceTail'], {
  JSON: { stringify: JSON.stringify, parse: text => {
    const value = JSON.parse(text);
    Object.defineProperty(value, 'getString', { value: key => value[key] ?? null });
    return value;
  } },
});
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
  assert.equal(content(tail.feed('normal paragraph',null)), 'normal paragraph');
});

test('unconfirmed blocks show literal source; Mermaid owns its preview and sessions stay isolated', () => {
  const tail = new LibmarkCodeTail();
  assert.equal(content(tail.feed('plain',null)), 'plain');
  tail.feed('\n```mermaid\n',event('',2,'mermaid'));
  assert.match(content(tail.feed('graph TD',null)), /graph TD/);
  assert.equal(content(new LibmarkCodeTail().feed('new',null)), 'new');
});

test('all unparsed Markdown syntax streams literally and delivery clears only its source preview', () => {
  for (const line of ['plain **bold**', '# heading', '- [x] task', '  - child', '> quote',
    '| A | B |', '|---|---|', '[link](https://example.com)', '![image](x.png)',
    '<div>HTML & text</div>', '---', '    indented code', '[^note]: footnote', '中文😀']) {
    const tail = new LibmarkCodeTail();
    let text = '';
    for (const char of line) {
      text += char;
      assert.equal(content(tail.feed(char, null)), text);
    }
    const native = {ops:[{op:2,kind:'html',index:0,unchanged:false,content:'<p>delivered</p>'}]};
    const delivered = tail.feed('\n', native);
    assert.equal(delivered.ops[0], native.ops[0]);
    assert.equal(delivered.ops.at(-1).kind, 'source');
    assert.equal(delivered.ops.at(-1).content, '');
    assert.equal(content(tail.feed('next', null)), 'next');
    assert.equal(content(tail.finish(null)), '');
  }
});

test('undelivered complete lines remain visible until parser delivery or finish', () => {
  const tail = new LibmarkCodeTail();
  assert.equal(content(tail.feed('[id]: url\n', null)), '[id]: url\n');
  assert.equal(content(tail.feed('next', null)), '[id]: url\nnext');
  assert.equal(content(tail.finish(null)), '');
});

const math = (source='', status='partial') => ({ops:[{op:status==='complete'?3:2,kind:'data',index:0,unchanged:false,content:JSON.stringify({type:'math',status,source})}]});
test('math previews the unfinished line, then native lines and the final image take over', () => {
  const tail = new LibmarkCodeTail();
  tail.feed('$$\n',math());
  assert.equal(JSON.parse(content(tail.feed('a',math()))).source, 'a');
  assert.equal(JSON.parse(content(tail.feed('^2',math()))).source, 'a^2');
  assert.equal(JSON.parse(content(tail.feed('\n',math('a^2\n')))).source, 'a^2\n');
  assert.equal(JSON.parse(content(tail.feed('+b',math('a^2\n')))).source, 'a^2\n+b');
  tail.feed('\n',math('a^2\n+b\n'));
  assert.equal(JSON.parse(content(tail.feed('$$',math('a^2\n+b\n')))).source, 'a^2\n+b\n');
  const final=math('a^2\n+b\n','complete');
  assert.equal(tail.feed('\n',final),final);
});

test('single-line display math strips its opening delimiter from source preview', () => {
  const tail = new LibmarkCodeTail();
  assert.equal(JSON.parse(content(tail.feed('$$a+b',math()))).source, 'a+b');
});

test('fence indentation is removed consistently with native code output', () => {
  const tail = new LibmarkCodeTail();
  tail.feed('  ```js\n',event());
  assert.match(content(tail.feed('  value',null)), />value<\/code>/);
  assert.match(content(tail.feed('\n  next',event('value\n'))), />value\nnext<\/code>/);
});

test('indented code uses the generic preview when there is no confirmed fence', () => {
  const tail = new LibmarkCodeTail();
  tail.feed('    first\n', event('first\n', 2, ''));
  assert.equal(content(tail.feed('    second', null)), '    second');
  assert.equal(tail.feed('\n', event('first\nsecond\n', 2, '')).ops.at(-1).content, '');
});

test('the opposite fence character is literal code, not a pending closing fence', () => {
  const tail = new LibmarkCodeTail();
  tail.feed('```js\n', event());
  assert.match(content(tail.feed('~', null)), />~<\/code>/);
});
