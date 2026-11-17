import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

test('speech upload uses the Qiniu temporary token and returns editable text', async () => {
  const task = { abort() {} };
  let tracked;
  const { transcribeAudioFile } = loadUts('uni_modules/uni-ai-x/sdk/speech-input.uts', ['transcribeAudioFile'], {
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
  assert.equal(await transcribeAudioFile('/recording.wav', value => { tracked = value; }), 'recognized text');
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
