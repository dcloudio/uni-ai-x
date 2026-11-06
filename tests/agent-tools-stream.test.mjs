import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

class TestSseParser {
  constructor(onChunk, _onError, onDone) {
    this.onChunk = onChunk;
    this.onDone = onDone;
    this.buffer = '';
    this.done = false;
  }

  push(data) { this.pushText(new TextDecoder().decode(data)); }

  pushText(data) {
    this.buffer += data;
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const event = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const payload = event.slice(6);
      if (payload == '[DONE]') {
        this.done = true;
        this.onDone();
      } else {
        this.onChunk(JSON.parse(payload));
      }
      boundary = this.buffer.indexOf('\n\n');
    }
  }

  finish() {
    if (!this.done) this.onDone();
  }
}

function event(delta) {
  return 'data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n';
}

test('calendar confirmation is separate from the streamed answer and needs no second model round', async () => {
  const sequence = [];
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const date = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, '0'), String(start.getDate()).padStart(2, '0')].join('-');
  const time = [String(start.getHours()).padStart(2, '0'), String(start.getMinutes()).padStart(2, '0')].join(':');
  const args = JSON.stringify({ title: '测试日程', start_at: date + ' ' + time });
  const rounds = [[
    event({ content: '我先帮你创建，' }),
    event({ tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'create_calendar_reminder', arguments: args.slice(0, 20) } }] }),
    event({ tool_calls: [{ index: 0, function: { arguments: args.slice(20) } }] }),
  ]];
  const requests = [];
  const uni = {
    request(options) {
      const chunks = rounds.shift();
      assert.ok(chunks, 'unexpected model round');
      requests.push(options.data);
      let receive = () => {};
      queueMicrotask(() => {
        for (const chunk of chunks) receive({ data: new TextEncoder().encode(chunk).buffer });
        receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
        options.success({ statusCode: 200, data: '' });
      });
      return { onChunkReceived(callback) { receive = callback; } };
    },
  };
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
    CustomProviderAdapter: class {},
    SseStreamParser: TestSseParser,
    registerCustomProvider() {},
    uni,
  });
  const adapter = new QiniuToolAdapter();
  const success = await adapter.request([{ role: 'user', content: '创建测试日程' }], 'test', 'chat', {
    onChunk(chunk) { sequence.push(chunk.choices[0].delta.content); },
    onToolConfirm(details) { sequence.push('confirm:' + details.title); },
    onDone() { sequence.push('done'); },
    onError(error) { throw new Error(JSON.stringify(error)); },
  });

  assert.equal(success, true);
  assert.deepEqual(sequence, ['我先帮你创建，', 'confirm:测试日程', 'done']);
  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[0].content, /只有用户询问天气时才调用/);
});

test('weather and calendar in one turn still stream the weather result after tool calls', async () => {
  const sequence = [];
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const startAt = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, '0'), String(start.getDate()).padStart(2, '0')].join('-')
    + ' ' + [String(start.getHours()).padStart(2, '0'), String(start.getMinutes()).padStart(2, '0')].join(':');
  const rounds = [
    [event({ tool_calls: [
      { index: 0, id: 'weather', type: 'function', function: { name: 'get_weather', arguments: '{"city":"北京"}' } },
      { index: 1, id: 'calendar', type: 'function', function: { name: 'create_calendar_reminder', arguments: JSON.stringify({ title: '喝水', start_at: startAt }) } },
    ] })],
    [event({ content: '北京今天' }), event({ content: '晴。' })],
  ];
  const requests = [];
  const uni = {
    request(options) {
      const chunks = rounds.shift();
      assert.ok(chunks, 'unexpected model round');
      requests.push(options.data);
      let receive = () => {};
      queueMicrotask(() => {
        for (const chunk of chunks) receive({ data: new TextEncoder().encode(chunk).buffer });
        receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
        options.success({ statusCode: 200, data: '' });
      });
      return { onChunkReceived(callback) { receive = callback; } };
    },
  };
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
    CustomProviderAdapter: class {},
    SseStreamParser: TestSseParser,
    registerCustomProvider() {},
    uni,
    uniCloud: { callFunction: async () => ({ result: { city: '北京', weather: '晴' } }) },
  });
  const success = await new QiniuToolAdapter().request([{ role: 'user', content: '北京天气怎么样，并提醒我喝水' }], 'test', 'chat', {
    onChunk(chunk) { sequence.push(chunk.choices[0].delta.content); },
    onToolConfirm(details) { sequence.push('confirm:' + details.title); },
    onDone() { sequence.push('done'); },
    onError(error) { throw new Error(JSON.stringify(error)); },
  });

  assert.equal(success, true);
  assert.deepEqual(sequence, ['北京今天', '晴。', 'confirm:喝水', 'done']);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].messages.at(-1).content, '{"status":"pending"}');
});
