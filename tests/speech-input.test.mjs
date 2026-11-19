import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

test('speech upload uses the Qiniu temporary token and returns editable text', async () => {
  const task = { abort() {} };
  let tracked;
  const { transcribeAudioFile } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['transcribeAudioFile'], {
    supportsDeepSeekApps: () => false,
    llmModelMap: new Map([['qiniu', { getToken: async () => 'temporary-token' }]]),
    uni: { uploadFile(options) {
      assert.equal(options.url, 'https://api.qnaigc.com/v1/audio/transcriptions');
      assert.equal(options.formData.model, 'qwen/qwen-audio-3.0-asr-flash');
      assert.equal(options.header.Authorization, 'Bearer temporary-token');
      assert.equal(options.name, 'file');
      queueMicrotask(() => options.success({ statusCode: 200, data: '{"text":" recognized text "}' }));
      return task;
    } },
  });
  assert.equal(await transcribeAudioFile('/recording.wav', value => { tracked = value; }, 'qiniu', 'vision-model'), 'recognized text');
  assert.equal(tracked, task);
});

test('empty, malformed and failed transcriptions are not inserted as text', () => {
  const { parseTranscription } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['parseTranscription']);
  for (const [status, body] of [[400, '{}'], [200, '{}'], [200, '{"text":" "}'], [200, '<html>']]) {
    assert.throws(() => parseTranscription(status, body));
  }
});

test('browser PCM is encoded as mono 16-bit WAV with sample clipping', async () => {
  const { encodeSpeechWav } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['encodeSpeechWav'], { Blob, ArrayBuffer, DataView }, ['WEB']);
  const wav = encodeSpeechWav(new Float32Array([-2, 0, 2]), 16000);
  const bytes = await wav.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});

for (const providerId of ['deepseek', 'qiniu']) {
  test(`${providerId} ASR uses only the selected provider token and endpoint`, async () => {
    const tokens = [];
    const requests = [];
    const { transcribeAudioFile } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['transcribeAudioFile'], {
      supportsDeepSeekApps: (id, model) => id === 'deepseek' && model === 'deepseek-flash',
      llmModelMap: new Map(['deepseek', 'qiniu'].map(id => [id, { getToken: async () => { tokens.push(id); return id + '-key'; } }])),
      uni: { uploadFile(options) {
        requests.push(options);
        queueMicrotask(() => options.success({ statusCode: 200, data: '{"text":"hello"}' }));
        return { abort() {} };
      } },
    });
    assert.equal(await transcribeAudioFile('/record.wav', () => {}, providerId, 'deepseek-flash'), 'hello');
    assert.deepEqual(tokens, [providerId]);
    assert.equal(requests[0].url, providerId === 'deepseek' ? 'https://api.deepseek.com/v1/tools/asr' : 'https://api.qnaigc.com/v1/audio/transcriptions');
    assert.equal(requests[0].header.Authorization, 'Bearer ' + providerId + '-key');
    assert.equal(requests[0].formData.model, providerId === 'qiniu' ? 'qwen/qwen-audio-3.0-asr-flash' : undefined);
  });
}
test('unconfigured providers never fall back to Qiniu ASR', async () => {
  const { transcribeAudioFile } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['transcribeAudioFile'], {
    supportsDeepSeekApps: () => false,
    llmModelMap: { get() { assert.fail('must not request another provider credential'); } },
  });
  await assert.rejects(transcribeAudioFile('/record.wav', () => {}, 'other', 'model'), /当前方案/);
});

test('route cancellation while retrieving token prevents an upload', async () => {
  let release;
  let cancelled = false;
  const { transcribeAudioFile } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['transcribeAudioFile'], {
    supportsDeepSeekApps: () => false,
    llmModelMap: new Map([['qiniu', {getToken: () => new Promise(resolve => { release = resolve; })}]]),
    uni: {uploadFile() {assert.fail('cancelled operation must not upload');}},
  });
  const pending = transcribeAudioFile('/record.wav', () => {}, 'qiniu', 'test', () => cancelled);
  cancelled = true; release('token');
  await assert.rejects(pending, /取消/);
});
