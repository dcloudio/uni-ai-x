import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadUts } from './uts-loader.mjs';

class TestSseParser {
  constructor(onChunk, _onError, onDone) {
    this.onChunk = onChunk;
    this.onDone = onDone;
    this.buffer = '';
  }

  push(data) { this.pushText(new TextDecoder().decode(data)); }

  pushText(data) {
    this.buffer += data;
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const payload = this.buffer.slice(6, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      if (payload == '[DONE]') this.onDone();
      else this.onChunk(JSON.parse(payload));
      boundary = this.buffer.indexOf('\n\n');
    }
  }

  finish() {}
}

function event(delta) {
  return 'data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n';
}

function weatherCall(argumentsText) {
  return event({ tool_calls: [{ index: 0, id: 'weather', type: 'function', function: { name: 'get_weather', arguments: argumentsText } }] });
}

const validWeather = {
  city: '北京', observed_at: '2026-11-10T14:00', weather: '晴',
  temperature_c: 12, today_max_c: 15, today_min_c: 4,
};

async function runScenario(rounds, results, userText = '北京天气') {
  const requests = [];
  const statuses = [];
  const errors = [];
  const chunks = [];
  let calls = 0;
  let done = false;
  const uni = {
    request(options) {
      const round = rounds.shift();
      assert.ok(round, 'unexpected model round');
      requests.push(structuredClone(options.data));
      let receive = () => {};
      queueMicrotask(() => {
        for (const chunk of round) receive({ data: new TextEncoder().encode(chunk).buffer });
        receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
        options.success({ statusCode: 200, data: '' });
      });
      return { onChunkReceived(callback) { receive = callback; } };
    },
  };
  const uniCloud = {
    async callFunction() {
      const result = results[calls++];
      if (result instanceof Error) throw result;
      return { result };
    },
  };
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
    CustomProviderAdapter: class {}, SseStreamParser: TestSseParser, registerCustomProvider() {}, uni, uniCloud,
  });
  const success = await new QiniuToolAdapter().request([{ role: 'user', content: userText }], 'test', 'chat', {
    onChunk(chunk) { chunks.push(chunk.choices[0].delta.content ?? ''); },
    onToolStatus(status) { statuses.push(status); },
    onError(error) { errors.push(error.errMsg); },
    onDone() { done = true; },
  });
  return { success, requests, statuses, errors, chunks, calls, done };
}

test('invalid model arguments are returned to the model for correction', async () => {
  const result = await runScenario([
    [weatherCall('null')],
    [weatherCall('{"city":"北京"}')],
    [event({ content: '北京现在晴，12°C。' })],
  ], [validWeather]);
  assert.equal(result.success, true);
  assert.equal(result.calls, 1);
  assert.equal(result.requests.length, 3);
  assert.equal(result.requests[1].tool_choice, 'auto');
  assert.match(result.requests[1].messages.at(-1).content, /工具参数必须是包含 city 的对象/);
  assert.equal(result.statuses[0], '天气查询工具参数无效，等待模型修正或向用户追问');
  assert.deepEqual(result.errors, []);
  assert.equal(result.done, true);
});

test('empty and incomplete weather results exhaust three attempts and show an error', async () => {
  const result = await runScenario([
    [weatherCall('{"city":"北京"}')],
  ], [null, { city: '北京' }, { error: '天气服务暂时不可用' }]);
  assert.equal(result.success, false);
  assert.equal(result.calls, 3);
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.statuses.slice(0, 2), ['天气查询工具调用失败，正在进行第一次重试', '天气查询工具再次调用失败，正在进行第二次重试']);
  assert.match(result.errors[0], /天气查询工具连续三次调用失败.*请点击重试/);
  assert.equal(result.done, false);
});

test('three invalid model tool calls stop without querying the weather service', async () => {
  const result = await runScenario([
    [weatherCall('null')],
    [weatherCall('{}')],
    [weatherCall('{bad json')],
  ], []);
  assert.equal(result.success, false);
  assert.equal(result.calls, 0);
  assert.equal(result.requests.length, 3);
  assert.match(result.errors[0], /模型连续三次提供了无效的天气查询参数.*请点击重试/);
});

test('the model may ask the user for a city after invalid tool arguments', async () => {
  const result = await runScenario([
    [weatherCall('null')],
    [event({ content: '请问你要查询哪个城市的天气？' })],
  ], []);
  assert.equal(result.success, true);
  assert.equal(result.calls, 0);
  assert.equal(result.requests.length, 2);
  assert.equal(result.requests[1].tool_choice, 'auto');
  assert.equal(result.chunks.join(''), '请问你要查询哪个城市的天气？');
  assert.equal(result.statuses.at(-1), '');
  assert.equal(result.done, true);
});

test('weather service failure can recover on the third attempt', async () => {
  const result = await runScenario([
    [weatherCall('{"city":"北京"}')],
    [event({ content: '北京现在晴，12°C。' })],
  ], [new Error('network'), { error: 'timeout' }, validWeather]);
  assert.equal(result.success, true);
  assert.equal(result.calls, 3);
  assert.equal(result.statuses[0], '天气查询工具调用失败，正在进行第一次重试');
  assert.equal(result.statuses[1], '天气查询工具再次调用失败，正在进行第二次重试');
  assert.equal(result.statuses.at(-1), '');
  assert.deepEqual(result.errors, []);
  assert.equal(result.done, true);
});

test('a successful first query does not announce retries', async () => {
  const result = await runScenario([
    [weatherCall('{"city":"北京"}')],
    [event({ content: '北京现在晴，12°C。' })],
  ], [validWeather]);
  assert.equal(result.success, true);
  assert.deepEqual(result.statuses, ['']);
  assert.equal(result.calls, 1);
});

test('an empty model answer after a tool result is reported as a model error', async () => {
  const result = await runScenario([
    [weatherCall('{"city":"北京"}')],
    [event({ content: '' })],
  ], [validWeather]);
  assert.equal(result.success, false);
  assert.match(result.errors[0], /模型没有生成回答/);
  assert.equal(result.done, false);
});

test('an empty model answer without a tool call is reported as a model error', async () => {
  const result = await runScenario([[event({ content: '' })]], []);
  assert.equal(result.success, false);
  assert.equal(result.calls, 0);
  assert.match(result.errors[0], /模型没有生成回答/);
});

test('the model decides whether to call a tool without keyword-based interception', async () => {
  const result = await runScenario([
    [event({ content: '暂无有效数据返回。' })],
  ], [], '帮我查一下北京现在的天气');
  assert.equal(result.success, true);
  assert.equal(result.requests.length, 1);
  assert.equal(result.calls, 0);
  assert.equal(result.chunks.join(''), '暂无有效数据返回。');
});

test('a successful tool result is passed to the model without rewriting its answer', async () => {
  const result = await runScenario([
    [weatherCall('{"city":"北京"}')],
    [event({ content: '接口没有返回结果。' })],
  ], [validWeather]);
  assert.equal(result.success, true);
  assert.equal(result.requests[1].tool_choice, 'auto');
  assert.match(result.requests[1].messages.at(-1).content, /"temperature_c":12/);
  assert.equal(result.chunks.join(''), '接口没有返回结果。');
});

test('a missing streamed tool call ID is paired with the tool result', async () => {
  const result = await runScenario([
    [event({ tool_calls: [{ index: 0, type: 'function', function: { name: 'get_weather', arguments: '{"city":"北京"}' } }] })],
    [event({ content: '北京现在晴，12°C。' })],
  ], [validWeather]);
  assert.equal(result.success, true);
  const messages = result.requests[1].messages;
  const callId = messages.at(-2).tool_calls[0].id;
  assert.match(callId, /^call_\d+_0_\d+$/);
  assert.equal(messages.at(-1).tool_call_id, callId);
  assert.match(messages.at(-1).content, /"weather":"晴"/);
});

test('a city-not-found tool result is returned to the model without service retries', async () => {
  const result = await runScenario([
    [weatherCall('{"city":"不存在的城市"}')],
    [event({ content: '请提供更明确的城市名称。' })],
  ], [{ code: 'city_not_found', error: '未找到对应城市' }]);
  assert.equal(result.success, true);
  assert.equal(result.calls, 1);
  assert.equal(result.requests[1].tool_choice, 'auto');
  assert.match(result.requests[1].messages.at(-1).content, /未找到对应城市/);
});

test('a request for the missing city remains a valid answer without a tool call', async () => {
  const result = await runScenario([
    [event({ content: '请问你要查询哪个城市的天气？' })],
  ], [], '帮我查一下天气');
  assert.equal(result.success, true);
  assert.equal(result.requests.length, 1);
  assert.equal(result.chunks.join(''), '请问你要查询哪个城市的天气？');
  assert.deepEqual(result.statuses, []);
});

test('a future weather question does not force the current-weather tool', async () => {
  const result = await runScenario([
    [event({ content: '这个工具只能查询当前天气。' })],
  ], [], '北京明天的天气怎么样');
  assert.equal(result.success, true);
  assert.equal(result.requests.length, 1);
  assert.equal(result.chunks.join(''), '这个工具只能查询当前天气。');
});

test('weather cloud function rejects an incomplete forecast response', async () => {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/uniCloud/cloudfunctions/weather-demo/index.js', import.meta.url), 'utf8');
  const exports = {};
  const logs = [];
  let requests = 0;
  vm.runInNewContext(source, {
    exports, URLSearchParams, console: { error(...values) { logs.push(values.join(' ')); } },
    uniCloud: { httpclient: { async request() {
      requests += 1;
      if (requests == 1) return { status: 200, data: { results: [{ name: '北京', latitude: 39.9, longitude: 116.4 }] } };
      return { status: 200, data: { current: { time: '2026-11-10T14:00', weather_code: 0 }, daily: { temperature_2m_max: [15], temperature_2m_min: [4] } } };
    } } },
  });
  const result = await exports.main({ city: '北京' });
  assert.equal(requests, 2);
  assert.equal(result.error, '天气服务返回的数据不完整');
  assert.equal(result.stage, 'forecast');
  assert.match(result.diagnostics.url, /api\.open-meteo\.com\/v1\/forecast/);
  assert.equal(result.diagnostics.status, 200);
  assert.match(logs[0], /temperature_2m_max/);
});

test('malformed city lookup is treated as a service error', async () => {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/uniCloud/cloudfunctions/weather-demo/index.js', import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(source, {
    exports, URLSearchParams, console: { error() {} },
    uniCloud: { httpclient: { async request() { return { status: 200, data: {} }; } } },
  });
  const result = await exports.main({ city: '北京' });
  assert.equal(result.error, '城市查询服务返回的数据不完整');
  assert.equal(result.code, undefined);
});

test('a valid empty city lookup is returned for model correction', async () => {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/uniCloud/cloudfunctions/weather-demo/index.js', import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(source, {
    exports, URLSearchParams, console: { error() {} },
    uniCloud: { httpclient: { async request() { return { status: 200, data: { generationtime_ms: 0.14 } }; } } },
  });
  const result = await exports.main({ city: '杭州萧山区' });
  assert.equal(result.code, 'city_not_found');
  assert.match(result.error, /杭州萧山区/);
});

test('cloud diagnostics do not reuse a previous response after a network exception', async () => {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/uniCloud/cloudfunctions/weather-demo/index.js', import.meta.url), 'utf8');
  const exports = {};
  const logs = [];
  let requests = 0;
  vm.runInNewContext(source, {
    exports, URLSearchParams, console: { error(...values) { logs.push(values.join(' ')); } },
    uniCloud: { httpclient: { async request() {
      requests += 1;
      if (requests == 1) return { status: 200, data: { results: [{ name: '北京', latitude: 39.9, longitude: 116.4 }] } };
      throw new Error('network timeout');
    } } },
  });
  const result = await exports.main({ city: '北京' });
  assert.equal(result.stage, 'forecast');
  assert.match(result.diagnostics.url, /api\.open-meteo\.com\/v1\/forecast/);
  assert.equal(result.diagnostics.status, null);
  assert.equal(result.diagnostics.responseBody, null);
  assert.match(logs[0], /network timeout/);
});
