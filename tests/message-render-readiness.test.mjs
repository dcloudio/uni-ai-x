import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const taskApi = () => loadUts('uni_modules/uni-ai-x/sdk/message-render-tasks.uts',
  ['beginMessageRenderTask', 'finishMessageRenderTask', 'hasMessageRenderTasks', 'messageRenderTaskRevision', 'forgetMessageRenderTasks'],
  { reactive: value => value });

// Execute the actual toolbar watcher with a controlled UI queue and clock.
function toolbar(platform = 'APP-ANDROID', chatState = 'completed') {
  const full = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue', import.meta.url), 'utf8');
  const enabled = [true];
  const source = full.slice(full.indexOf('const toolbarDelayReady'), full.indexOf('const shouldShowToolBar'))
    .split('\n').filter(line => {
      const directive = /^\s*\/\/\s*#(ifdef|ifndef|endif)\b\s*(.*)/.exec(line);
      if (!directive) return enabled.at(-1);
      if (directive[1] === 'endif') { enabled.pop(); return false; }
      const matches = directive[2].split('||').some(flag => flag.trim() === platform);
      enabled.push(enabled.at(-1) && (directive[1] === 'ifdef' ? matches : !matches));
      return false;
    }).join('\n');
  const msg = { value: { _id: 'm', body: 'answer', rendered: true, thinkContent: '', toolStatus: '', toolResultText: '' } };
  const state = { value: chatState };
  const presentation = { settled: false, revision: 1 };
  const tasks = taskApi();
  const watches = [], ticks = [], unmounts = [], timers = new Map();
  let now = 0, sequence = 0;
  const ref = value => ({ value });
  const api = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) + '\nreturn { toolbarDelayReady };})()', {
    msg, state, parts: ref([{ kind: 'toolbar' }]), ref, computed: getter => ({ get value() { return getter(); } }),
    isLastAiMsg: ref(true), calendarConfirmationRevision: ref(0), uiTheme: ref('light'), messageToolBarVisible: ref(true),
    ...tasks, uniAiMdStreamIsSettled: () => presentation.settled,
    uniAiMdStreamGetRevision: () => presentation.revision, readMessagePresentationRevision: () => presentation.revision,
    watch(getter, callback) { watches.push({ getter, callback, last: [...getter()] }); callback(); },
    nextTick: callback => ticks.push(callback), onUnmounted: callback => unmounts.push(callback),
    setTimeout: (callback, delay) => { timers.set(++sequence, { at: now + delay, callback }); return sequence; },
    clearTimeout: id => timers.delete(id),
  });
  const flush = () => {
    for (const watch of watches) {
      const next = [...watch.getter()];
      if (next.some((value, i) => value !== watch.last[i])) { watch.last = next; watch.callback(); }
    }
    while (ticks.length) ticks.shift()();
  };
  const advance = duration => {
    flush();
    const target = now + duration;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback(); flush();
    }
    now = target;
  };
  return { ...api, tasks, msg, state, presentation, timers, flush, advance, unmount: () => unmounts.forEach(fn => fn()) };
}

test('network completion waits for native presentation, then a full quiet second', () => {
  const api = toolbar();
  api.advance(5000);
  assert.equal(api.toolbarDelayReady.value, false);
  api.presentation.settled = true;
  api.advance(999);
  assert.equal(api.toolbarDelayReady.value, false);
  api.advance(1);
  assert.equal(api.toolbarDelayReady.value, true);
});

test('slow image work blocks the timer; a later presentation update restarts it', () => {
  const api = toolbar();
  api.presentation.settled = true;
  const token = api.tasks.beginMessageRenderTask('m', 'math-image');
  api.advance(5000);
  assert.equal(api.toolbarDelayReady.value, false);
  api.tasks.finishMessageRenderTask('m', 'math-image', token);
  api.advance(900);
  api.presentation.revision++;
  api.advance(999);
  assert.equal(api.toolbarDelayReady.value, false);
  api.advance(1);
  assert.equal(api.toolbarDelayReady.value, true);
});

test('late thinking and same-length body replacements both restart the quiet period', () => {
  const api = toolbar('WEB');
  api.advance(900);
  api.msg.value.thinkContent = 'another round';
  api.advance(900);
  api.msg.value.body = 'ANSWER';
  api.advance(999);
  assert.equal(api.toolbarDelayReady.value, false);
  api.advance(1);
  assert.equal(api.toolbarDelayReady.value, true);
});

test('stop, tool-only replies and unmount obey the same delay and invalidate queued callbacks', () => {
  const api = toolbar();
  api.state.value = 'stop';
  api.advance(2000);
  assert.equal(api.toolbarDelayReady.value, false);
  api.msg.value.body = '';
  api.msg.value.toolResultText = 'cancelled';
  api.advance(999);
  assert.equal(api.toolbarDelayReady.value, false);
  const old = [...api.timers.values()][0].callback;
  api.unmount(); old();
  assert.equal(api.toolbarDelayReady.value, false);
});

test('obsolete tasks cannot finish replacement work or recreate a deleted message', () => {
  const api = taskApi();
  const old = api.beginMessageRenderTask('m', 'diagram');
  const current = api.beginMessageRenderTask('m', 'diagram');
  api.finishMessageRenderTask('m', 'diagram', old);
  assert.equal(api.hasMessageRenderTasks('m'), true);
  api.finishMessageRenderTask('m', 'diagram', current);
  assert.equal(api.hasMessageRenderTasks('m'), false);
  const late = api.beginMessageRenderTask('m', 'diagram');
  api.forgetMessageRenderTasks('m');
  api.finishMessageRenderTask('m', 'diagram', late);
  assert.equal(api.messageRenderTaskRevision('m'), 0);
});

test('recycling an already loaded image cannot block the message toolbar again', () => {
  const watches = [], unmounts = [];
  const api = loadUts('uni_modules/uni-ai-x/sdk/message-render-tasks.uts',
    ['useMessageRenderTask', 'hasMessageRenderTasks', 'forgetMessageRenderTasks'], {
      reactive: value => value,
      watch(getter, callback) { watches.push({ getter, callback, last: getter() }); callback(); },
      onUnmounted: callback => unmounts.push(callback),
    });
  const row = { message: 'm', pending: true, resource: 'light:formula.svg' };
  const flush = () => {
    for (const entry of watches) {
      const next = entry.getter();
      if (next.some((value, i) => value !== entry.last[i])) {
        entry.last = next;
        entry.callback();
      }
    }
  };
  api.useMessageRenderTask(() => row.message, () => 'math-image', () => row.pending, () => row.resource);
  assert.equal(api.hasMessageRenderTasks('m'), true);
  row.pending = false; flush();
  assert.equal(api.hasMessageRenderTasks('m'), false);
  row.pending = true; flush();
  assert.equal(api.hasMessageRenderTasks('m'), false, 'offscreen reload of the same settled image');
  row.resource = 'dark:formula.svg'; flush();
  assert.equal(api.hasMessageRenderTasks('m'), true, 'a new resource still waits for completion');
  row.pending = false; flush();
  row.message = 'other'; row.pending = true; flush();
  assert.equal(api.hasMessageRenderTasks('other'), true, 'completion is scoped to the message');
  unmounts.forEach(callback => callback());
  assert.equal(api.hasMessageRenderTasks('other'), false);
  api.forgetMessageRenderTasks('m');
  row.message = 'm'; row.resource = 'light:formula.svg'; flush();
  assert.equal(api.hasMessageRenderTasks('m'), true, 'released messages do not retain resource readiness');
});

test('unsupported code highlighting settles to escaped source in both presentation paths', () => {
  for (const path of ['sdk/code-presentation.uts', 'utssdk/worker/code-presentation.uts']) {
    const tasks = taskApi();
    let finish, displayed;
    const { prepareCodeBlocks } = loadUts('uni_modules/uni-ai-x/' + path, ['prepareCodeBlocks'], {
      ...tasks,
      markdownCodeTokenToRichTextNodes: token => [{ type: 'text', text: token.text }],
      requestCachedCodeText: callback => { finish = callback; },
    });
    const block = { kind: 'code', key: 'code-0', text: '<custom>', language: 'unknown', isComplete: true };
    prepareCodeBlocks('m', [block], blocks => { displayed = blocks; });
    finish({ error: 'unsupported', lines: [] });
    assert.equal(displayed[0].codeHighlightedText, '<custom>');
    assert.ok(displayed[0].codeLines[0].html.includes('&lt;custom&gt;'));
    assert.equal(tasks.hasMessageRenderTasks('m'), false);
  }
});

test('cold history rebuild with Bash code reaches worker completion and shows the last toolbar', () => {
  const ui = toolbar('APP-ANDROID', 'none');
  const callbacks = [], messages = [];
  const code = loadUts('uni_modules/uni-ai-x/utssdk/worker/code-presentation.uts', ['prepareCodeBlocks', 'buildCodeHtmlPatch'], {
    markdownCodeTokenToRichTextNodes: token => [{ type: 'text', text: token.text }],
    requestCachedCodeText(callback, _id, _key, text, language) {
      if (language === 'bash') callback({ error: 'unsupported', lines: [] });
      else callbacks.push(() => callback({ error: null, lines: [[{ text }]] }));
    },
  });
  const { nativeRenderBlock } = loadUts('uni_modules/uni-ai-x/utssdk/worker/native-presentation.uts', ['nativeRenderBlock']);
  const raw = ['js', 'bash'].map((language, index) => ({
    kind: 'code', key: 'code-' + index, text: language === 'bash' ? 'echo hello' : 'const x = 1', language,
    html: '', isComplete: true, columnWidths: [], rowTextWidths: [], codeCompleteLines: 1,
    svgSource: '', svgWidth: 0, svgHeight: 0,
  }));
  const { AiPresentationWorkerTask } = loadUts('uni_modules/uni-ai-x/workers/aiPresentationWorkerTask.uts', ['AiPresentationWorkerTask'], {
    ...code, nativeRenderBlock,
    WorkerTaskImpl: class { postMessage(message) { messages.push(message); } },
    UniAiMdHtmlStreamAdapter: class { applyOps() {} markComplete() {} getBlocks() { return raw; } },
    linkMarkdownFootnotes: html => html, linkSearchCitations: html => html,
    releaseCodeHighlightSessions() {},
  });
  const worker = new AiPresentationWorkerTask();
  worker.onMessage({ action: 'prepare', id: 'm', done: true, body: 'answer', theme: 'light', windowWidth: 360, citationIds: [], ops: [] });
  assert.equal(messages.at(-1).settled, false);
  ui.advance(5000);
  assert.equal(ui.toolbarDelayReady.value, false);
  callbacks.forEach(callback => callback());
  assert.equal(messages.at(-1).settled, true);
  assert.ok(messages.some(message => message.changes?.some(change => change.block.language === 'bash' && change.block.codeHighlightedText === 'echo hello')));
  ui.presentation.settled = messages.at(-1).settled;
  ui.presentation.revision++;
  ui.advance(999);
  assert.equal(ui.toolbarDelayReady.value, false);
  ui.advance(1);
  assert.equal(ui.toolbarDelayReady.value, true);
});
