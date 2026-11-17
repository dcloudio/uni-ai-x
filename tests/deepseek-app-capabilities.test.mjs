import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const provider = () => new Map([['deepseek', { baseURL: 'https://api.deepseek.com/chat/completions', models: [{ modelId: 'deepseek-flash' }], getToken: async () => 'temporary-test-token' }]]);
const api = uni => loadUts('uni_modules/uni-ai-x/sdk/deepseek-app-api.uts', ['documentPurpose', 'uploadDeepSeekDocument', 'recognizeDeepSeekFile', 'parseOcrPages', 'synthesizeDeepSeekSpeech'], { uni, llmModelMap: provider(), DataView });

test('document upload selects parsing purpose and preserves the returned file ID', async () => {
  const requests = [];
  let tracked;
  const task = { abort() {} };
  const sdk = api({ uploadFile(options) {
    requests.push(options);
    queueMicrotask(() => options.success({ statusCode: 200, data: '{"id":"file-api-test"}' }));
    return task;
  } });
  const file = await sdk.uploadDeepSeekDocument('/local/report.docx', 'report.docx', value => tracked = value);
  assert.equal(requests[0].formData.purpose, 'rich_layout_recognition');
  assert.equal(requests[0].header.Authorization, 'Bearer temporary-test-token');
  assert.equal(file.id, 'file-api-test');
  assert.equal(file.name, 'report.docx');
  assert.equal(tracked, task);
  assert.equal(sdk.documentPurpose('sheet.XLSX'), 'user_data');
  assert.equal(sdk.documentPurpose('paper.pdf'), 'rich_layout_recognition');
  assert.throws(() => sdk.documentPurpose('app.exe'));
});

test('OCR fills only complete recognized pages; errors never become document text', async () => {
  const sdk = api({ uploadFile(options) {
    assert.equal(options.url, 'https://api.deepseek.com/v1/tools/ocr');
    assert.equal(options.formData.purpose, 'text_recognition');
    queueMicrotask(() => options.success({ statusCode: 200, data: JSON.stringify({ pages: [{ text: 'IRIS 83', finish_reason: 'stop' }] }) }));
    return {};
  } });
  assert.equal(await sdk.recognizeDeepSeekFile('/local/image.png', () => {}), 'IRIS 83');
  for (const pages of [[], [{ text: '', finish_reason: 'stop' }], [{ text: 'partial', finish_reason: 'length' }]]) {
    assert.throws(() => sdk.parseOcrPages(JSON.stringify({ pages })));
  }
});

test('TTS checks response status, WAV header and length instead of playing an error body', async () => {
  for (const valid of [true, false]) {
    const bytes = new ArrayBuffer(48);
    if (valid) {
      new DataView(bytes).setUint32(0, 0x52494646, false);
      new DataView(bytes).setUint32(8, 0x57415645, false);
    }
    const sdk = api({ request(options) {
      assert.equal(options.data.format, 'wav');
      queueMicrotask(() => options.success({ statusCode: 200, data: bytes }));
      return {};
    } });
    if (valid) assert.equal((await sdk.synthesizeDeepSeekSpeech('Hello', () => {})).byteLength, 48);
    else await assert.rejects(sdk.synthesizeDeepSeekSpeech('Hello', () => {}));
    await assert.rejects(sdk.synthesizeDeepSeekSpeech('中'.repeat(5001), () => {}));
  }
});

function adapterHarness(chunks, isCancelled = () => false) {
  const requests = [];
  const { SseStreamParser } = loadUts('uni_modules/uni-ai-x/sdk/sse.uts', ['SseStreamParser'], { TextDecoder, Uint8Array, utils: { runOnDispatcher(_name, fn) { fn(); } }, console });
  const uni = { request(options) {
    requests.push(options.data);
    let receive;
    queueMicrotask(() => {
      for (const choice of chunks) receive({ data: new TextEncoder().encode('data: ' + JSON.stringify({ choices: [choice] }) + '\n\n').buffer });
      receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
      options.success({ statusCode: 200, data: '' });
    });
    return { onChunkReceived(callback) { receive = callback; }, abort() {} };
  } };
  const { DeepSeekAppAdapter } = loadUts('uni_modules/uni-ai-x/sdk/deepseek-app-adapter.uts', ['DeepSeekAppAdapter'], {
    uni, llmModelMap: provider(), SseStreamParser, CustomProviderAdapter: class {}, supportsDeepSeekApps: () => false,
  }, ['WEB']);
  return { adapter: new DeepSeekAppAdapter(), requests, isCancelled };
}

test('official app calls enable safety and server search, retain signatures and deduplicate citations', async () => {
  const steps = [{ calls: [{ kind: 'image_search', signature: 'opaque-page-signature', page: { url: 'https://example.test', title: 'Page' }, sources: [{ url: 'https://example.test', title: 'Page', image_url: 'https://example.test/image.jpg' }] }] }];
  const h = adapterHarness([{ delta: { content: 'Answer' } }, { finish_reason: 'stop', delta: { server_tool_calls: steps, annotations: [{ url_citation: { url: 'https://example.test', title: 'Page' } }] } }]);
  const output = [];
  let stored;
  let sources;
  assert.equal(await h.adapter.request([{ role: 'user', content: 'Search' }, { role: 'assistant', content: '' }], 'deepseek-flash', 'chat', {
    webSearch: true, onChunk(chunk) { if (chunk.choices?.[0]?.delta?.content) output.push(chunk.choices[0].delta.content); },
    onServerTools(calls) { stored = calls; }, onSearch(search) { sources = search.sources; },
    onError(error) { assert.fail(JSON.stringify(error)); },
  }, false), true);
  assert.equal(h.requests[0].safety_check.level, 'high');
  assert.equal(h.requests[0].messages.length, 1);
  assert.deepEqual(Array.from(h.requests[0].tools, t => t.type), ['deepseek_read_url', 'deepseek_web_search']);
  assert.equal(h.requests[0].thinking.type, 'disabled');
  assert.equal(stored[0].calls[0].signature, 'opaque-page-signature');
  assert.equal(sources.length, 1);
  assert.equal(sources[0].imageUrl, 'https://example.test/image.jpg');
  assert.deepEqual(output, ['Answer', '\n\n来源：[1]']);
});

test('safety refusal and cancellation cannot be reported as a successful answer', async () => {
  for (const cancelled of [false, true]) {
    const h = adapterHarness([{ delta: { content: 'Preliminary text' } }, { finish_reason: 'content_filter', delta: { content: '' } }]);
    const errors = [];
    const ok = await h.adapter.request([{ role: 'user', content: 'test' }], 'deepseek-flash', 'chat', {
      isCancelled: () => cancelled, onError(error) { errors.push(error); }, onDone() { assert.fail('must not complete'); },
    });
    assert.equal(ok, false);
    assert.equal(errors.length, cancelled ? 0 : 1);
    if (!cancelled) { assert.match(errors[0].errMsg, /安全审核未通过/); assert.equal(errors[0].errCode, 'content_filter'); }
  }
});

test('message history retains file IDs and server tool signatures for follow-up questions', () => {
  const { buildAiMessages } = loadUts('uni_modules/uni-ai-x/sdk/message-builder.uts', ['buildAiMessages']);
  const messages = buildAiMessages({ msgList: [
    { from_uid: 'user', body: 'Summarize', file_list: [{ id: 'file-api-test', name: 'report.pdf', provider: 'deepseek' }] },
    { from_uid: 'uni-ai', body: 'Answer', serverToolCalls: [{ calls: [{ signature: 'opaque-signature' }] }] },
  ] });
  assert.equal(messages[0].content.find(p => p.type === 'file').file_id, 'file-api-test');
  assert.equal(messages[1].server_tool_calls[0].calls[0].signature, 'opaque-signature');
});
