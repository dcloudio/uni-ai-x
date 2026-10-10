import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function setup() {
  const timers = new Map();
  let timerId = 0;
  const requests = [], outgoing = [], errors = [], instances = [];
  const html = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-html.uts', [
    'codeLanguage', 'decodeHtmlText', 'findOpenTag', 'prepareMarkdownTable',
    'markdownTableNaturalHeight', 'markdownTableThemeColors', 'applyMarkdownTableTheme', 'applyMarkdownTableColumnWidths',
  ]);
  const adapter = loadUts('uni_modules/uni-ai-worker/utssdk/libmark-html.uts', ['LibmarkHtmlStreamAdapter'], {
    ...html, TextEncoder, uni: { arrayBufferToBase64: b => Buffer.from(b).toString('base64') },
  });
  const converter = loadUts('uni_modules/uni-ai-worker/utssdk/native-presentation.uts', ['nativeRenderBlock']);
  const rich = loadUts('uni_modules/uni-ai-worker/utssdk/markdown-rich-text.uts', ['markdownCodeTokenToRichTextNodes']);
  const code = loadUts('uni_modules/uni-ai-worker/utssdk/code-presentation.uts', ['prepareCodeBlocks', 'buildCodeHtmlPatch'], {
    ...rich, requestCachedCodeText: (callback, id, key, text) => requests.push({ callback, id, key, text }),
  });
  const table = loadUts('uni_modules/uni-ai-worker/utssdk/table-presentation.uts', ['prepareTablePresentation'], html);
  const { AiPresentationWorkerTask } = loadUts('workers/aiPresentationWorkerTask.uts', ['AiPresentationWorkerTask'], {
    ...adapter, ...converter, ...code, ...table, releaseCodeHighlightSessions() {},
    closeCodeHighlightWorker: () => ({ then: callback => callback() }),
    WorkerTaskImpl: class { postMessage(message) { outgoing.push(message); this.receive(message); } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  const runtime = loadUts('uni_modules/uni-ai-worker-runtime/utssdk/presentation.uts', [
    'prepareAndroidPresentation', 'releaseAndroidPresentation',
  ], {
    console: { error: text => errors.push(text), log() {} },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    uni: { createWorker() {
      const task = new AiPresentationWorkerTask();
      const instance = {
        task, terminated: false,
        onMessage(fn) { task.receive = fn; }, onError(fn) { this.error = fn; },
        postMessage(message) { task.onMessage(message); }, terminate() { this.terminated = true; },
      };
      instances.push(instance);
      return instance;
    } },
  });
  const store = loadUts('uni_modules/uni-ai-x/sdk/libmark-stream-store.uts', [
    'libmarkStreamApply', 'libmarkStreamGetBlocks', 'libmarkStreamGetRevision', 'libmarkStreamRelease',
    'libmarkStreamMarkComplete', 'libmarkStreamSetTheme', 'libmarkStreamRequestRebuild',
  ], {
    ...runtime, ...adapter, ref: value => ({ value }), releaseCodeHighlightSessions() {},
    prepareNativeInlineMathBlocks() {}, prepareNativeMermaidBlocks() {}, requestAiWorkerMarkdownRebuild() {},
  });
  return { ...store, requests, outgoing, errors, instances,
    ready() { instances.at(-1).task.entry(); },
    flush() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); },
    highlight(index = requests.length - 1) {
      const request = requests[index];
      request.callback({ error: null, lines: request.text.split('\n').map(text => [{ text, className: 'keyword' }]) });
    },
  };
}

const op = (text, operation = 3) => ({ op: operation, kind: 'html', index: 0, unchanged: false, content: text });
const code = text => '<pre><code class="language-js">' + text + '</code></pre>';

test('Android queues startup, coalesces tail bursts, and publishes highlighted worker deltas', () => {
  const api = setup();
  api.libmarkStreamApply('m', [op(code('a'), 2)]);
  api.libmarkStreamApply('m', [op(code('ab'), 2)]);
  assert.equal(api.libmarkStreamGetBlocks('m').length, 0);
  api.ready();
  api.flush();
  assert.equal(api.libmarkStreamGetBlocks('m')[0].text, 'ab');
  assert.equal(api.outgoing.filter(m => m.action === 'blocks').length, 1);
  api.libmarkStreamApply('m', [op(code('ab\n'))]);
  api.libmarkStreamMarkComplete('m');
  assert.equal(api.libmarkStreamGetBlocks('m')[0].isComplete, true);
  api.highlight();
  assert.match(api.libmarkStreamGetBlocks('m')[0].codeHtml, /color:/);
  assert.equal(api.libmarkStreamGetBlocks('m')[0].codeTokens.length, 0);
  assert.equal(api.errors.length, 0);
});

test('completed code is not highlighted or transferred again when a later block changes', () => {
  const api = setup();
  api.libmarkStreamApply('m', [op(code('const a = 1;\n'))]);
  api.ready(); api.flush(); api.highlight();
  const count = api.requests.length;
  api.libmarkStreamApply('m', [op('<p>next</p>', 2)]);
  api.flush();
  assert.equal(api.requests.length, count);
  const last = api.outgoing.at(-1);
  assert.equal(last.changes.length, 1);
  assert.equal(last.changes[0].index, 1);
  assert.equal(api.libmarkStreamGetBlocks('m').length, 2);
});

test('release rejects delayed results, terminates the last worker, and rebuilds use a new identity', () => {
  const api = setup();
  api.libmarkStreamApply('m', [op(code('old\n'))]);
  api.ready(); api.flush();
  api.libmarkStreamRelease('m');
  assert.equal(api.instances[0].terminated, true);
  api.libmarkStreamApply('m', [op(code('new\n'))]);
  api.ready(); api.flush(); api.highlight(0);
  assert.equal(api.libmarkStreamGetBlocks('m')[0].text, 'new');
  api.highlight(1);
  assert.equal(api.libmarkStreamRequestRebuild('m', 'new'), false);
});

test('tables are prepared off-thread and theme changes deliver a fresh presentation', () => {
  const api = setup();
  api.libmarkStreamApply('m', [op('<table><tr><th>A</th></tr><tr><td>B</td></tr></table>')]);
  api.ready(); api.flush();
  const light = api.libmarkStreamGetBlocks('m')[0].table;
  assert.ok(light.height.endsWith('px'));
  api.libmarkStreamSetTheme('dark'); api.flush();
  assert.notEqual(api.libmarkStreamGetBlocks('m')[0].table.html, light.html);
});

test('worker failure preserves the last visible content and reports the failure', () => {
  const api = setup();
  api.libmarkStreamApply('m', [op('<p>text</p>')]);
  api.ready(); api.flush();
  api.instances[0].error(new Error('failed'));
  assert.equal(api.libmarkStreamGetBlocks('m')[0].html, '<p>text</p>');
  assert.equal(api.errors.length, 1);
});

test('long code transfers a single prepared HTML string and its complete dimensions', () => {
  const api = setup();
  const prefix = Array.from({ length: 64 }, (_, i) => 'const n' + i + ' = ' + i + ';').join('\n') + '\n';
  api.libmarkStreamApply('m', [op(code(prefix + 'a'), 2)]);
  api.ready(); api.flush(); api.highlight();
  const before = api.libmarkStreamGetBlocks('m')[0];
  assert.equal(before.codeContentHeight, '1430px');
  assert.equal((before.codeHtml.match(/<div /g) ?? []).length, 65);
  api.libmarkStreamApply('m', [op(code(prefix + 'ab'), 2)]);
  api.flush();
  const after = api.libmarkStreamGetBlocks('m')[0];
  assert.notEqual(after.codeHtml, before.codeHtml);
  assert.ok(after.codeHtml.includes('ab'));
  const delta = api.outgoing.at(-1).changes[0];
  assert.ok(delta.block.codeHtmlPrefix > 0);
  assert.equal(before.codeHtml.slice(0, delta.block.codeHtmlPrefix) + delta.block.codeHtml, after.codeHtml);
  assert.ok(delta.block.codeHtml.length < after.codeHtml.length / 10);
  assert.equal(delta.block.codeChunks, undefined);
  assert.equal(delta.block.codeLines.length, 0);
});

test('closed paragraphs stay separate and unchanged when the next paragraph streams', () => {
  const api = setup();
  api.libmarkStreamApply('m', [op('<p>first</p>'), op('<p>second</p>')]);
  api.ready(); api.flush();
  assert.equal(api.libmarkStreamGetBlocks('m').length, 2);
  api.libmarkStreamApply('m', [op('<p>tail</p>', 2)]);
  api.flush();
  assert.equal(api.outgoing.at(-1).changes.length, 1);
  assert.equal(api.outgoing.at(-1).changes[0].index, 2);
});
