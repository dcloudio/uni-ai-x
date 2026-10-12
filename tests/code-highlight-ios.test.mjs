import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

class IToken {
  constructor(startIndex, endIndex, scopes) { Object.assign(this, { startIndex, endIndex, scopes }); }
}
class ILineTokens {
  constructor(tokens) { this.tokens = tokens; }
}
const page = loadUts('uni_modules/uni-ai-x/sdk/parseCode.uts', ['tokensForLine'], { MarkdownToken: {} });
const rich = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-rich-text.uts', ['markdownCodeTokenToRichTextNodes']);
const iosPage = loadUts('uni_modules/uni-ai-x/sdk/parseCode.uts', ['decodeIosCodeTokens'], { MarkdownToken: {} }, ['APP', 'APP-IOS']);

function setup(nativeTokens = () => []) {
  class ScopeparserBridge {
    addGrammar() { return {}; }
    tokenizeLine(_handle, _language, text) { return JSON.stringify(nativeTokens(text)); }
    resetStackHandle() {}
    destroyStackHandle() {}
  }
  return loadUts('uni_modules/uni-highlight/utssdk/app-ios/index.uts',
    ['mapByteOffsetsToCharOffsets', 'CreateHighLighter'], {
      IToken, ILineTokens, ScopeparserBridge,
      JSON: { stringify: JSON.stringify, parseArray: JSON.parse },
      // The JS loader evaluates UTS native argument labels as assignments.
      withLangId: null, jsonText: null, withHandle: null, text: null,
    }, ['APP', 'APP-IOS']);
}

function display(source, tokens) {
  const api = setup();
  const converted = api.mapByteOffsetsToCharOffsets(source, tokens);
  const lines = page.tokensForLine(source, new ILineTokens(converted.map(token =>
    new IToken(token.start, token.end, token.token.split(' ')))));
  assert.equal(lines.map(token => token.text).join(''), source);
  return Array.from(lines, token => ({ text: token.text, className: token.className }));
}

test('iOS keeps unhighlighted gaps, tails, indentation and empty token lines', () => {
  assert.deepEqual(display('const value = 123;', [
    { start: 0, end: 5, token: 'storage.type.js' },
    { start: 14, end: 17, token: 'constant.numeric.js' },
  ]), [
    { text: 'const', className: 'storage' },
    { text: ' value = ', className: '' },
    { text: '123', className: 'constant' },
    { text: ';', className: '' },
  ]);
  assert.deepEqual(display('  unclassified();', []), [{ text: '  unclassified();', className: '' }]);
  assert.deepEqual(display('', []), []);
});

test('iOS UTF-8 ranges color the intended UTF-16 text after Chinese and emoji', () => {
  const prefix = '// 中文😀 ';
  const start = Buffer.byteLength(prefix);
  assert.deepEqual(display(prefix + 'value;', [{ start, end: start + 5, token: 'variable.other.js' }]), [
    { text: prefix, className: '' },
    { text: 'value', className: 'variable' },
    { text: ';', className: '' },
  ]);
});

test('iOS rejects invalid byte boundaries and does not duplicate overlapping ranges', () => {
  const source = '中😀x';
  assert.deepEqual(display(source, [
    { start: 1, end: 7, token: 'string' },
    { start: 3, end: 5, token: 'comment' },
    { start: -1, end: 100, token: 'keyword' },
  ]), [{ text: source, className: '' }]);
  assert.deepEqual(display('abcdef', [
    { start: 0, end: 4, token: 'keyword' },
    { start: 2, end: 6, token: 'string' },
  ]), [{ text: 'abcd', className: 'keyword' }, { text: 'ef', className: 'string' }]);
});

test('all iOS tokenizer entry points preserve source and produce matching colors', async () => {
  const { CreateHighLighter } = setup(() => [{ start: 7, end: 8, token: 'variable.other.js' }]);
  const highlighter = new CreateHighLighter({ languages: { javascript: {} } });
  const source = '中😀x;';
  const results = [
    await highlighter.tokenizeLine('javascript', source, null),
    (await highlighter.tokenizeLines('session', 'javascript', [source], true))[0],
    (await highlighter.tokenizeFullText('javascript', source))[0],
    iosPage.decodeIosCodeTokens(await highlighter.tokenizeLinesJson('json-session', 'javascript', [source], true), [source])[0],
  ];
  for (const result of results) {
    assert.equal(Object.getPrototypeOf(result).constructor.name, 'Object');
    for (const token of result.tokens) assert.equal(Object.getPrototypeOf(token).constructor.name, 'Object');
    const transferred = JSON.parse(JSON.stringify(result));
    assert.ok(Array.isArray(transferred.tokens));
    const tokens = page.tokensForLine(source, transferred);
    assert.equal(tokens.map(token => token.text).join(''), source);
    assert.equal(tokens.find(token => token.className === 'variable').text, 'x');
    const nodes = rich.markdownCodeTokenToRichTextNodes({ type: 'code_block', text: source, codeTokens: [tokens] });
    const textOf = node => node.type === 'text' ? node.text : (node.children ?? []).map(textOf).join('');
    assert.equal(nodes.map(textOf).join(''), source);
  }
});

test('iOS JSON boundary rejects missing fields, invalid ranges and source loss', () => {
  for (const rows of [[{}], [{ tokens: [] }], [{ tokens: [{ startIndex: 0, endIndex: 1, scopes: [] }] }],
    [{ tokens: [{ startIndex: 0, endIndex: 3, scopes: 'keyword' }] }],
    [{ tokens: [{ startIndex: -1, endIndex: 3, scopes: [] }] }]]) {
    assert.throws(() => iosPage.decodeIosCodeTokens(JSON.stringify(rows), ['abc']));
  }
  assert.throws(() => iosPage.decodeIosCodeTokens('not json', ['abc']));
});
