import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const ref = value => ({ value });
const rich = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-rich-text.uts', ['markdownCodeTokenToRichTextNodes']);
const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts', ['codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable']);
const { LibmarkHtmlStreamAdapter } = loadUts('uni_modules/uni-ai-worker/utssdk/libmark-html.uts', ['LibmarkHtmlStreamAdapter'], {
  ...html, TextEncoder, uni: { arrayBufferToBase64: value => Buffer.from(value).toString('base64') },
});
const converters = loadUts('uni_modules/uni-ai-x/sdk/markdown-text.uts',
  ['libmarkHtmlBlocksToTextBlocks', 'markdownHtmlBlocksToTextBlocks']);

function setup() {
  const requests = [];
  const diagrams = [];
  const code = loadUts('uni_modules/uni-ai-x/sdk/code-presentation.uts', ['prepareCodeBlocks'], {
    ...rich, requestCachedCodeText: (callback, messageId, key, text, language) => requests.push({ callback, messageId, key, text, language }),
  });
  const mermaid = loadUts('uni_modules/uni-ai-x/sdk/mermaid-presentation.uts', ['prepareNativeMermaidBlocks'], {
    ref, renderMermaidSvgForTheme: (text, theme, callback) => diagrams.push({ text, theme, callback }),
  });
  const store = loadUts('uni_modules/uni-ai-x/sdk/libmark-stream-store.uts',
    ['libmarkStreamApply', 'libmarkStreamGetBlocks', 'libmarkStreamGetRevision', 'libmarkStreamRelease', 'libmarkStreamApplyRebuild', 'libmarkStreamRequestRebuild', 'libmarkStreamSetTheme'], {
      ref, ...code, ...mermaid, ...converters, LibmarkHtmlStreamAdapter, requestAiWorkerMarkdownRebuild() {}, prepareNativeInlineMathBlocks() {}, releaseCodeHighlightSessions() {},
    }, ['APP', 'APP-HARMONY']);
  const legacy = loadUts('uni_modules/uni-ai-x/sdk/message-presentation.uts',
    ['refreshMessagePresentation', 'readMessagePresentation', 'forgetMessagePresentation'], {
      ref, shallowRef: ref, ...code, ...converters, mathWindowWidth: ref(412), releaseCodeHighlightSessions() {},
      linkMarkdownFootnotes: text => text, linkSearchCitations: text => text,
    });
  return { ...code, ...store, ...legacy, requests, diagrams };
}

const op = (content, kind = 'html', index = 0) => ({ op: 3, content, kind, index, unchanged: false });
const codeOp = text => op('<pre><code class="language-js">' + text + '</code></pre>');
const finish = (request, error = null) => request.callback({
  language: request.language, error,
  lines: error == null ? [[{ text: request.text, className: 'keyword' }]] : [],
});
const codeBlock = text => ({
  kind: 'code', key: 'code-0', text, language: 'js', isComplete: true, html: '',
  codeTokens: [], columnWidths: [], rowTextWidths: [],
});
const lineHtml = block => block.codeLines.map(line => line.html).join('');

test('presentation revisions change only for the message receiving source or asynchronous results', () => {
  const api = setup();
  api.libmarkStreamApply('history', [codeOp('old')]);
  finish(api.requests[0]);
  const revision = api.libmarkStreamGetRevision('history');
  api.libmarkStreamApply('live', [codeOp('new')]);
  const plainRevision = api.libmarkStreamGetRevision('live');
  finish(api.requests[1]);
  assert.equal(api.libmarkStreamGetRevision('history'), revision);
  assert.ok(api.libmarkStreamGetRevision('live') > plainRevision);
  api.libmarkStreamRelease('history');
  assert.equal(api.libmarkStreamGetRevision('history'), 0);
  api.libmarkStreamApply('history', [codeOp('recreated')]);
  assert.ok(api.libmarkStreamGetRevision('history') > revision);
});

test('native snapshots expose source immediately and replace it with highlighted HTML', () => {
  const api = setup();
  api.libmarkStreamApply('m', [codeOp('const value = 1;')]);
  assert.equal(api.libmarkStreamGetBlocks('m').length, 1);
  const plain = lineHtml(api.libmarkStreamGetBlocks('m')[0]);
  assert.ok(plain.includes('const'));
  assert.ok(plain.includes('value'));
  finish(api.requests[0]);
  const block = api.libmarkStreamGetBlocks('m')[0];
  assert.ok(lineHtml(block).includes('color:'));
  assert.notEqual(lineHtml(block), plain);
  assert.ok(lineHtml(block).includes('const'));
  assert.equal(block.codeHeight, '38px');
});

test('newer native source and released messages reject delayed highlights', () => {
  const api = setup();
  api.libmarkStreamApply('m', [{ ...codeOp('old'), op: 2 }]);
  api.libmarkStreamApply('m', [{ ...codeOp('new'), op: 2 }]);
  assert.equal(api.libmarkStreamGetBlocks('m')[0].text, 'new');
  assert.ok(lineHtml(api.libmarkStreamGetBlocks('m')[0]).includes('new'));
  assert.equal(api.requests.length, 0);
  assert.equal(api.libmarkStreamGetBlocks('m')[0].text, 'new');
  api.libmarkStreamApply('m', [codeOp('deleted')]);
  api.libmarkStreamRelease('m');
  finish(api.requests[0]);
  assert.equal(api.libmarkStreamGetBlocks('m').length, 0);
});

test('unfinished line stays plain through every append and highlights on completion', () => {
  const api = setup();
  let visible = [];
  for (const text of ['c', 'co', 'const x = 1;']) {
    api.prepareCodeBlocks('m', [{ ...codeBlock(text), isComplete: false }], blocks => { visible = blocks; }, visible);
    assert.equal(api.requests.length, 0);
    assert.ok(!visible[0].codeLines[0].html.includes('<span'));
  }
  api.prepareCodeBlocks('m', [codeBlock('const x = 1;')], blocks => { visible = blocks; }, visible);
  assert.equal(api.requests.length, 1);
  finish(api.requests[0]);
  assert.ok(visible[0].codeLines[0].html.includes('<span'));
});

test('newline highlights its completed line while the next streaming line stays plain', () => {
  const api = setup();
  api.libmarkStreamApply('m', [{ ...codeOp('first'), op: 2 }]);
  assert.equal(api.requests.length, 0);
  api.libmarkStreamApply('m', [{ ...codeOp('first\n'), op: 2 }]);
  assert.equal(api.requests.length, 1);
  finish(api.requests[0]);
  const first = api.libmarkStreamGetBlocks('m')[0].codeLines[0];
  for (const tail of ['s', 'se', 'second']) {
    api.libmarkStreamApply('m', [{ ...codeOp('first\n' + tail), op: 2 }]);
    const rows = api.libmarkStreamGetBlocks('m')[0].codeLines;
    assert.equal(rows[0], first);
    assert.ok(!rows[1].html.includes('<span'));
    assert.equal(api.requests.length, 1);
  }
  api.libmarkStreamApply('m', [{ ...codeOp('first\nsecond\n'), op: 2 }]);
  assert.equal(api.requests.length, 2);
  assert.equal(api.requests[1].text, 'first\nsecond');
});

test('failed highlighting publishes escaped original code instead of blocking the snapshot', () => {
  const api = setup();
  const blocks = [codeBlock('<script>&value')];
  let ready = false;
  api.prepareCodeBlocks('m', blocks, () => { ready = true; });
  finish(api.requests[0], 'unsupported');
  assert.equal(ready, true);
  assert.ok(lineHtml(blocks[0]).includes('&lt;script&gt;&amp;value'));
  assert.ok(!lineHtml(blocks[0]).includes('<script>'));
});

test('legacy platforms publish streaming source immediately and reuse completed highlights', () => {
  const api = setup();
  const msg = { _id: 'm', body: '', markdownBlocks: JSON.stringify([codeBlock('old')]) };
  api.refreshMessagePresentation(msg, 'light');
  assert.equal(api.readMessagePresentation('m')[0].text, 'old');
  msg.markdownBlocks = JSON.stringify([codeBlock('new')]);
  api.refreshMessagePresentation(msg, 'light');
  assert.equal(api.readMessagePresentation('m')[0].text, 'new');
  finish(api.requests[1]);
  finish(api.requests[0]);
  assert.equal(api.readMessagePresentation('m')[0].text, 'new');
  api.refreshMessagePresentation(msg, 'dark');
  assert.equal(api.requests.length, 2);
});

test('historical native code can finish asynchronous preparation without triggering another rebuild', () => {
  const api = setup();
  assert.equal(api.libmarkStreamRequestRebuild('m', 'code'), true);
  assert.equal(api.libmarkStreamApplyRebuild('m', [codeOp('history')]), true);
  assert.equal(api.libmarkStreamRequestRebuild('m', 'code'), false);
  finish(api.requests[0]);
  assert.ok(lineHtml(api.libmarkStreamGetBlocks('m')[0]).length > 0);
});

test('native Mermaid uses its SVG; fallback publishes into the separate Mermaid presentation', () => {
  const api = setup();
  const svg = '<svg width="100" height="50"><text>A</text></svg>';
  api.libmarkStreamApply('m', [op(JSON.stringify({ type: 'mermaid', source: 'graph TD; A-->B', svg }), 'data')]);
  assert.ok(api.libmarkStreamGetBlocks('m')[0].mermaidImageSource.startsWith('data:'));
  assert.equal(api.diagrams.length, 0);
  api.libmarkStreamApply('g', [op(JSON.stringify({ type: 'mermaid', source: 'gantt\n title Plan' }), 'data')]);
  assert.equal(api.diagrams.length, 1);
  api.diagrams[0].callback({ imageSource: '/gantt.svg' });
  assert.equal(api.libmarkStreamGetBlocks('g')[0].mermaidImageSource, '/gantt.svg');
});

test('code view only displays prepared HTML and Mermaid retains its original source inset', () => {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-msg-code/uni-ai-msg-code.uvue', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /requestCachedCodeText|highlightCode|renderMermaid|watch\s*\(/);
  assert.match(source, /:nodes="preparedHtml"/);
  assert.doesNotMatch(source, /computed\s*[<(]|preparedLines/);
  assert.equal((source.match(/<rich-text\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /<rich-text\b[^>]*\bv-for=/);
  const mermaid = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-msg-mermaid.uvue', import.meta.url), 'utf8');
  assert.match(mermaid, /margin-left: 15px/);
});

test('empty code lines retain a visible layout placeholder before and after highlighting', () => {
  const api = setup();
  let visible;
  api.prepareCodeBlocks('m', [codeBlock('first\n\nlast\n')], blocks => { visible = blocks; });
  const check = () => {
    assert.equal(visible[0].codeLines.length, 4);
    assert.equal(visible[0].codeHeight, '104px');
    assert.equal(visible[0].codeContentHeight, '88px');
    assert.equal(visible[0].codeHtml, visible[0].codeLines.map(line => '<div style="height:22px;line-height:22px;white-space:pre;">' + line.html + '</div>').join(''));
    for (const index of [1, 3]) {
      assert.equal(visible[0].codeLines[index].text, '');
      assert.ok(visible[0].codeLines[index].html.includes('\u00a0'));
    }
    assert.equal(visible[0].text, 'first\n\nlast\n');
  };
  check();
  api.requests[0].callback({ error: null, lines: [
    [{ text: 'first', className: 'keyword' }], [], [{ text: 'last', className: '' }], [],
  ] });
  check();
});

test('streaming append preserves highlighted prefix lines and updates only the changed row', () => {
  const api = setup();
  let visible;
  api.prepareCodeBlocks('m', [codeBlock('first\nsecond')], blocks => { visible = blocks; });
  const plainSnapshot = visible[0];
  api.requests[0].callback({ error: null, lines: [
    [{ text: 'first', className: 'keyword' }], [{ text: 'second', className: 'string' }],
  ] });
  const first = visible[0].codeLines[0];
  assert.notEqual(visible[0], plainSnapshot);
  assert.notEqual(visible[0].codeLines[0].html, plainSnapshot.codeLines[0].html);
  const second = visible[0].codeLines[1];
  api.prepareCodeBlocks('m', [codeBlock('first\nsecond\nthird')], blocks => { visible = blocks; }, visible);
  assert.equal(visible[0].codeLines[0], first);
  assert.equal(visible[0].codeLines[1], second);
  assert.ok(visible[0].codeLines[2].html.includes('third'));
  api.requests[1].callback({ error: null, lines: [
    [{ text: 'first', className: 'keyword' }], [{ text: 'second', className: 'string' }],
    [{ text: 'third', className: 'constant' }],
  ] });
  assert.equal(visible[0].codeLines[0], first);
  assert.equal(visible[0].codeLines[1], second);
  assert.ok(visible[0].codeLines[2].html.includes('color:'));
});
