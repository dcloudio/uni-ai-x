import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function reader(uni) {
  return loadUts('uni_modules/uni-ai-x/sdk/web-reader.uts', ['readWebLink'], { uni }).readWebLink;
}

test('Fetch uses the temporary credential, bounds content, and rejects invalid URLs', async () => {
  let requests = 0;
  let trackedTask;
  const task = { abort() {} };
  const read = reader({ request(options) {
    requests++;
    assert.equal(options.url, 'https://api.qnaigc.com/v1/tools/fetch');
    assert.equal(options.header.Authorization, 'Bearer temporary-token');
    assert.equal(options.data.url, 'https://example.test/article');
    queueMicrotask(() => options.success({ statusCode: 200, data: { title: 'Article', content: 'a'.repeat(50000) } }));
    return task;
  } });
  for (const url of ['file:///etc/passwd', 'https://user:password@example.test', 'not-a-url']) {
    assert.ok(JSON.parse(await read(JSON.stringify({ url }), 'temporary-token', {})).error);
  }
  assert.ok(JSON.parse(await read('{bad', 'temporary-token', {})).error);
  assert.equal(requests, 0);
  const result = JSON.parse(await read('{"url":"https://example.test/article"}', 'temporary-token', {
    onTaskCreate(value) { trackedTask = value; },
  }));
  assert.equal(trackedTask, task);
  assert.equal(result.content.length, 48000);
  assert.equal(result.truncated, true);
});

test('Fetch errors and empty responses become explicit tool failures', async () => {
  for (const response of [
    { statusCode: 404, data: {} },
    { statusCode: 200, data: { content: '' } },
    { statusCode: 200, data: '<html>unexpected</html>' },
  ]) {
    const read = reader({ request(options) {
      queueMicrotask(() => options.success(response));
      return {};
    } });
    const result = JSON.parse(await read('{"url":"https://example.test/article"}', 'token', {}));
    assert.match(result.error, /不要根据链接猜测网页内容/);
    assert.equal(result.content, undefined);
  }
});

test('a cancelled read does not issue a request', async () => {
  const read = reader({ request() { assert.fail('cancelled request'); } });
  assert.equal(await read('{"url":"https://example.test/article"}', 'token', { isCancelled: () => true }), '');
});

test('model tool call fetches the page and returns its content before streaming the answer', async () => {
  const requests = [];
  const chunks = [];
  const states = [];
  let modelRound = 0;
  const uni = { request(options) {
    requests.push(structuredClone({ url: options.url, data: options.data }));
    let receive;
    queueMicrotask(() => {
      if (options.url.endsWith('/tools/fetch')) {
        options.success({ statusCode: 200, data: { title: 'Article', content: 'Unique page facts' } });
        return;
      }
      const delta = modelRound++ === 0
        ? { tool_calls: [{ index: 0, id: 'read-1', type: 'function', function: { name: 'read_web_link', arguments: '{"url":"https://example.test/article"}' } }] }
        : { content: 'Summary based on page facts' };
      receive({ data: new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\ndata: [DONE]\n\n').buffer });
      options.success({ statusCode: 200, data: '' });
    });
    return { onChunkReceived(callback) { receive = callback; }, abort() {} };
  } };
  const { SseStreamParser } = loadUts('uni_modules/uni-ai-x/sdk/sse.uts', ['SseStreamParser'], {
    TextDecoder, Uint8Array, utils: { runOnDispatcher(_name, fn) { fn(); } }, console,
  });
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    uni, console, SseStreamParser, readWebLink: reader(uni), CustomProviderAdapter: class {},
    mcpServers: [], McpClient: class {}, McpRequestError: class extends Error {},
    llmModelMap: new Map([['qiniu', { baseURL: 'https://api.qnaigc.com/v1/chat/completions', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
  }, ['WEB']);
  const ok = await new QiniuToolAdapter().request([{ role: 'user', content: 'Summarize https://example.test/article' }], 'test', 'chat', {
    onChunk(chunk) { chunks.push(chunk.choices[0].delta.content); },
    onToolStatus(state) { states.push(state); },
    onError(error) { assert.fail(JSON.stringify(error)); },
  });
  assert.equal(ok, true);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].url, 'https://api.qnaigc.com/v1/tools/fetch');
  const toolResult = requests[2].data.messages.find(message => message.role === 'tool');
  assert.equal(toolResult.tool_call_id, 'read-1');
  assert.equal(JSON.parse(toolResult.content).content, 'Unique page facts');
  assert.deepEqual(chunks, ['Summary based on page facts']);
  assert.deepEqual(states, ['正在阅读网页', '']);
});

test('cancelling a streamed answer ignores late chunks and does not start another tool round', async () => {
  let cancelled = false;
  const visible = [];
  let requests = 0;
  const uni = { request(options) {
    requests++;
    let receive;
    queueMicrotask(() => {
      const emit = delta => receive({ data: new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n').buffer });
      emit({ content: 'Before cancellation' });
      cancelled = true;
      emit({ content: 'Late content' });
      emit({ tool_calls: [{ index: 0, id: 'late', type: 'function', function: { name: 'read_web_link', arguments: '{"url":"https://example.test"}' } }] });
      receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
      options.success({ statusCode: 200, data: '' });
    });
    return { onChunkReceived(callback) { receive = callback; }, abort() {} };
  } };
  const { SseStreamParser } = loadUts('uni_modules/uni-ai-x/sdk/sse.uts', ['SseStreamParser'], {
    TextDecoder, Uint8Array, utils: { runOnDispatcher(_name, fn) { fn(); } }, console,
  });
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    uni, console, SseStreamParser, CustomProviderAdapter: class {},
    mcpServers: [], McpClient: class {}, McpRequestError: class extends Error {},
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
  }, ['WEB']);
  const ok = await new QiniuToolAdapter().request([{ role: 'user', content: 'Read a link' }], 'test', 'chat', {
    isCancelled: () => cancelled,
    onChunk(chunk) { visible.push(chunk.choices[0].delta.content); },
    onDone() { assert.fail('cancelled answer must not finish'); },
    onError(error) { assert.fail(JSON.stringify(error)); },
  });
  assert.equal(ok, false);
  assert.equal(requests, 1);
  assert.deepEqual(visible, ['Before cancellation']);
});
