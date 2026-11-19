import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function harness() {
  let clock = 1000;
  const enabled = [true];
  let source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-voice-input.uvue', import.meta.url), 'utf8').split('<script setup lang="uts">')[1].split('</script>')[0];
  source = source.split('\n').filter(line => {
    const m = /^\s*\/\/\s*#(ifdef|ifndef|endif)\s*(.*)/.exec(line);
    if (!m) return enabled.at(-1);
    if (m[1] === 'endif') enabled.pop();
    else enabled.push(enabled.at(-1) && (m[1] === 'ifndef'));
    return false;
  }).join('\n').replace(/^import[^\n]*\n/gm, '');
  const state = { voicePhase: 'idle', voiceCancel: false, attachments: false };
  const chat = { id: 'one', state: 'idle', inputContent: '' };
  const calls = [], notices = [], pending = [];
  const ai = { llm: {provider: 'qiniu', model: 'test'}, currentChat: chat, imgList: [], sendMsg(text) { calls.push(text); } };
  const recorder = {
    onStart(fn) { this.started = fn; }, onStop(fn) { this.stopped = fn; }, onError(fn) { this.error = fn; },
    start() {}, stop() { this.stops = (this.stops ?? 0) + 1; },
  };
  const watches = [];
  const api = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) + '\nreturn {begin, release, cancel, touchMove};})()', {
    uniAi: ai, composerState: state, documentDrafts: { pending },
    ref: value => ({ value }), computed: definition => typeof definition === 'function' ? { get value() { return definition(); } } : { get value() { return definition.get(); }, set value(v) { definition.set(v); } },
    tr: cn => cn, onUnmounted() {}, watch(_getter, fn) { watches.push(fn); },
    Date: { now: () => clock }, clearTimeout() {}, setTimeout() { return 1; },
    uni: { getRecorderManager: () => recorder, showToast: value => notices.push(value.title) },
    transcribeAudioFile: async () => { api.transcribes++; if (api.deferTranscription) return await new Promise(resolve => { api.resolveTranscription = resolve; }); return '测试文字'; },
  });
  api.transcribes = 0;
  return { api, state, ai, chat, recorder, calls, notices, pending, watches, advance: () => { clock += 1000; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('release gives immediate recognition feedback and sends exactly once', async () => {
  const h = harness(); await h.api.begin(700); h.recorder.started(); h.advance();
  h.api.release(); h.api.release();
  assert.equal(h.state.voicePhase, 'recognizing');
  assert.equal(h.recorder.stops, 1);
  h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.deepEqual(h.calls, ['测试文字']); assert.equal(h.chat.inputContent, '');
});
test('sliding up cancels without an ASR request or message', async () => {
  const h = harness(); await h.api.begin(700); h.recorder.started(); h.advance();
  h.api.touchMove({ touches: [{ screenY: 600 }] }); assert.equal(h.state.voiceCancel, true);
  h.api.release(); h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.equal(h.api.transcribes, 0); assert.equal(h.calls.length, 0); assert.equal(h.state.voicePhase, 'idle');
});
test('release while microphone permission is pending stops a late start', async () => {
  const h = harness(); await h.api.begin(700); h.api.release(); h.recorder.started();
  assert.equal(h.recorder.stops, 1);
  h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.equal(h.api.transcribes, 0); assert.equal(h.state.voicePhase, 'idle');
});
test('short tap never uploads or sends', async () => {
  const h = harness(); await h.api.begin(700); h.recorder.started(); h.api.release();
  h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.equal(h.api.transcribes, 0); assert.ok(h.notices.some(n => n.includes('太短')));
});
test('pending attachment keeps recognized text as a draft', async () => {
  const h = harness(); h.pending.push({ chatId: 'one' });
  await h.api.begin(700); h.recorder.started(); h.advance(); h.api.release();
  h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.equal(h.chat.inputContent, '测试文字'); assert.equal(h.calls.length, 0);
});
test('switching chat during recording never sends to another conversation', async () => {
  const h = harness(); await h.api.begin(700); h.recorder.started(); h.advance();
  h.ai.currentChat = { id: 'two', inputContent: '' }; h.watches[0]();
  h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.equal(h.api.transcribes, 0); assert.equal(h.calls.length, 0);
});

test('switching provider during recording cancels ASR instead of borrowing the old route', async () => {
  const h = harness(); await h.api.begin(700); h.recorder.started(); h.advance();
  h.ai.llm = { provider: 'deepseek', model: 'deepseek-flash' }; h.watches[1]();
  h.recorder.stopped({ tempFilePath: '/record.wav' }); await tick();
  assert.equal(h.api.transcribes, 0); assert.equal(h.calls.length, 0);
});

test('switching provider during recognition ignores even a late successful result', async () => {
  const h = harness(); h.api.deferTranscription = true;
  await h.api.begin(700); h.recorder.started(); h.advance(); h.api.release();
  h.recorder.stopped({tempFilePath:'/record.wav'}); await tick();
  assert.equal(h.api.transcribes, 1);
  h.ai.llm.provider = 'deepseek'; h.watches[1]();
  h.api.resolveTranscription('late text'); await tick();
  assert.equal(h.chat.inputContent, ''); assert.equal(h.calls.length, 0);
});
