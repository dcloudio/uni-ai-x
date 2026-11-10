import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function sse(message, prefix = '') {
  return prefix + 'event: message\n' + 'data: ' + JSON.stringify(message) + '\n\n';
}

test('MCP client initializes, keeps the session, lists tools, and ignores SSE notifications', async () => {
  const requests = [];
  const uni = {
    request(options) {
      requests.push({ data: structuredClone(options.data), header: structuredClone(options.header) });
      const { method, id } = options.data;
      queueMicrotask(() => {
        let data = '';
        if (method == 'initialize') data = sse({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18' } });
        if (method == 'tools/list') data = sse({ jsonrpc: '2.0', id, result: { tools: [{ name: 'geocode_location', description: 'Find a place', inputSchema: { type: 'object' } }] } });
        if (method == 'tools/call') data = sse({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info' } })
          + sse({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Beijing' }] } });
        options.success({ statusCode: method == 'notifications/initialized' ? 202 : 200, header: method == 'initialize' ? { 'Mcp-Session-Id': 'session-123' } : {}, data });
      });
    },
  };
  const { McpClient } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpClient'], { uni });
  const client = new McpClient({ id: 'weather', url: 'https://example.test/mcp' });
  const tools = await client.listTools();
  assert.equal(tools[0].name, 'geocode_location');
  const result = await client.callTool('geocode_location', { name: 'Beijing' });
  assert.equal(result.content[0].text, 'Beijing');
  assert.deepEqual(requests.map((request) => request.data.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.equal(requests[1].header['Mcp-Session-Id'], 'session-123');
  assert.equal(requests[3].header['Mcp-Session-Id'], 'session-123');
  await client.listTools();
  assert.equal(requests.length, 4);
});

test('MCP client follows paginated tool lists', async () => {
  const cursors = [];
  const uni = {
    request(options) {
      const { method, id, params } = options.data;
      queueMicrotask(() => {
        let data = '';
        if (method == 'initialize') data = sse({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18' } });
        if (method == 'tools/list') {
          cursors.push(params.cursor ?? '');
          data = sse({ jsonrpc: '2.0', id, result: params.cursor
            ? { tools: [{ name: 'forecast', inputSchema: { type: 'object' } }] }
            : { tools: [{ name: 'geocode', inputSchema: { type: 'object' } }], nextCursor: 'next' } });
        }
        options.success({ statusCode: method == 'notifications/initialized' ? 202 : 200, header: {}, data });
      });
    },
  };
  const { McpClient } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpClient'], { uni });
  const client = new McpClient({ id: 'weather', url: 'https://example.test/mcp' });
  assert.deepEqual(Array.from(await client.listTools(), (tool) => tool.name), ['geocode', 'forecast']);
  assert.deepEqual(cursors, ['', 'next']);
});

test('MCP HTTP failures classify retryable and terminal responses', async () => {
  let status = 401;
  let sessions = 0;
  const uni = {
    request(options) {
      const { method, id } = options.data;
      queueMicrotask(() => {
        if (method == 'initialize') {
          sessions += 1;
          options.success({ statusCode: 200, header: { 'Mcp-Session-Id': 'session-' + sessions }, data: sse({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18' } }) });
        } else if (method == 'tools/list') {
          options.success({ statusCode: 200, header: {}, data: sse({ jsonrpc: '2.0', id, result: { tools: [{ name: 'forecast', inputSchema: { type: 'object' } }] } }) });
        } else if (method == 'tools/call') {
          options.success({ statusCode: status, header: { 'Retry-After': '2' }, data: 'failed' });
        } else {
          options.success({ statusCode: 202, header: {}, data: '' });
        }
      });
    },
  };
  const { McpClient, McpRequestError } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpClient', 'McpRequestError'], { uni });
  const client = new McpClient({ id: 'weather', url: 'https://example.test/mcp' });
  await client.listTools();
  for (const [code, retryable, delayMs] of [[401, false, 0], [403, false, 0], [400, false, 0], [429, true, 2000], [503, true, 0], [404, true, 0]]) {
    status = code;
    await assert.rejects(client.callTool('forecast', {}), (error) => {
      assert.ok(error instanceof McpRequestError);
      assert.equal(error.retryable, retryable);
      assert.equal(error.delayMs, delayMs);
      return true;
    });
  }
  status = 200;
  await client.listTools();
  assert.equal(sessions, 2, 'expired session reconnects before the next tool call');
});

class TestSseParser {
  constructor(onChunk, _onError, onDone) { this.onChunk = onChunk; this.onDone = onDone; this.buffer = ''; }
  push(data) { this.pushText(new TextDecoder().decode(data)); }
  pushText(data) {
    this.buffer += data;
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const payload = this.buffer.slice(0, boundary).slice(6);
      this.buffer = this.buffer.slice(boundary + 2);
      if (payload == '[DONE]') this.onDone();
      else this.onChunk(JSON.parse(payload));
      boundary = this.buffer.indexOf('\n\n');
    }
  }
  finish() {}
}

function modelEvent(delta) { return 'data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n'; }

test('agent exposes MCP weather tools while keeping the legacy weather tool disabled', async () => {
  const modelRequests = [];
  const mcpRequests = [];
  const rounds = [
    [modelEvent({ tool_calls: [{ index: 0, id: 'geo', type: 'function', function: { name: 'weather__geocode_location', arguments: '{"name":"Beijing"}' } }] })],
    [modelEvent({ tool_calls: [{ index: 0, id: 'forecast', type: 'function', function: { name: 'weather__get_weather_forecast', arguments: '{"latitude":39.9,"longitude":116.4}' } }] })],
    [modelEvent({ content: '北京现在晴，12°C。' })],
  ];
  const tools = [
    { name: 'geocode_location', description: 'Find coordinates for a city', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    { name: 'get_weather_forecast', description: 'Get current conditions using coordinates', inputSchema: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' } }, required: ['latitude', 'longitude'] } },
  ];
  const uni = {
    request(options) {
      if (options.url == '/chat') {
        const round = rounds.shift();
        assert.ok(round, 'unexpected model request');
        modelRequests.push(structuredClone(options.data));
        let receive = () => {};
        queueMicrotask(() => {
          for (const chunk of round) receive({ data: new TextEncoder().encode(chunk).buffer });
          receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
          options.success({ statusCode: 200, data: '' });
        });
        return { onChunkReceived(callback) { receive = callback; } };
      }
      mcpRequests.push(structuredClone(options.data));
      const { method, id } = options.data;
      queueMicrotask(() => {
        let data = '';
        if (method == 'initialize') data = sse({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18' } });
        if (method == 'tools/list') data = sse({ jsonrpc: '2.0', id, result: { tools } });
        if (method == 'tools/call') data = sse({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: options.data.params.name == 'geocode_location' ? '{"latitude":39.9,"longitude":116.4}' : '{"temperature_c":12,"weather":"晴"}' }] } });
        options.success({ statusCode: method == 'notifications/initialized' ? 202 : 200, header: method == 'initialize' ? { 'Mcp-Session-Id': 'session-xyz' } : {}, data });
      });
    },
  };
  const { McpClient, McpRequestError } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpClient', 'McpRequestError'], { uni });
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
    legacyWeatherToolEnabled: false,
    mcpServers: [{ id: 'weather', url: 'https://example.test/mcp', tools: ['geocode_location', 'get_weather_forecast'] }],
    McpClient, McpRequestError, CustomProviderAdapter: class {}, SseStreamParser: TestSseParser, registerCustomProvider() {}, uni,
    uniCloud: { callFunction() { throw new Error('legacy weather must not run'); } },
  });
  const chunks = [];
  const statuses = [];
  const success = await new QiniuToolAdapter().request([{ role: 'user', content: '北京现在的天气' }], 'test', 'chat', {
    onChunk(chunk) { chunks.push(chunk.choices[0].delta.content); },
    onToolStatus(status) { statuses.push(status); },
    onError(error) { throw new Error(error.errMsg); },
  });
  assert.equal(success, true);
  assert.equal(chunks.join(''), '北京现在晴，12°C。');
  assert.deepEqual(modelRequests[0].tools.map((tool) => tool.function.name), [
    'create_calendar_reminder', 'weather__geocode_location', 'weather__get_weather_forecast',
  ]);
  assert.equal(modelRequests[1].messages.at(-1).tool_call_id, 'geo');
  assert.equal(modelRequests[2].messages.at(-1).tool_call_id, 'forecast');
  assert.deepEqual(mcpRequests.filter((request) => request.method == 'tools/call').map((request) => request.params.name), ['geocode_location', 'get_weather_forecast']);
  assert.deepEqual(statuses, [
    '天气查询工具 · 连接天气服务 · 正在连接',
    '天气查询工具 · 确定查询步骤 · 服务已连接，正在等待模型选择工具',
    '天气查询工具 · 查找城市坐标 · 正在查询',
    '天气查询工具 · 查找城市坐标 · 查询完成，正在准备下一步',
    '天气查询工具 · 获取实时天气 · 正在查询',
    '天气查询工具 · 获取实时天气 · 天气数据已获取，正在生成回答',
    '',
  ]);
});

test('MCP transport failures retry visibly, while tool errors go back to the model', async () => {
  const { McpRequestError } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpRequestError']);
  const { executeMcpTool } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['executeMcpTool'], {
    llmModelMap: new Map(), legacyWeatherToolEnabled: false, mcpServers: [], McpClient: class {},
    McpRequestError, CustomProviderAdapter: class {}, registerCustomProvider() {}, SseStreamParser: class {},
    setTimeout(resolve) { resolve(); },
  });
  const statuses = [];
  let calls = 0;
  const binding = { client: {
    config: { id: 'weather', url: 'https://example.test/mcp' },
    async callTool() {
      calls += 1;
      if (calls < 3) throw new McpRequestError('network timeout', true);
      return { content: [{ type: 'text', text: '{"weather":"晴"}' }] };
    },
  }, remoteName: 'forecast' };
  const callbacks = { onToolStatus(status) { statuses.push(status); } };
  const result = await executeMcpTool(binding, '{"latitude":39.9}', callbacks);
  assert.equal(JSON.parse(JSON.parse(result).content[0].text).weather, '晴');
  assert.equal(calls, 3);
  assert.deepEqual(statuses, ['天气查询工具 · 获取实时天气 · 正在查询', '天气查询工具 · 获取实时天气 · 首次调用失败，正在第 1 次重试', '天气查询工具 · 获取实时天气 · 再次调用失败，正在第 2 次重试', '天气查询工具 · 获取实时天气 · 天气数据已获取，正在生成回答']);

  binding.client.callTool = async () => {
    calls += 1;
    return { isError: true, content: [{ type: 'text', text: 'latitude is required' }] };
  };
  const modelError = await executeMcpTool(binding, '{}', callbacks);
  assert.match(modelError, /latitude is required/);
  assert.equal(calls, 4);

  binding.client.callTool = async () => {
    calls += 1;
    if (calls == 5) return { isError: true, structuredContent: { error: { message: 'upstream timeout', retryable: true } } };
    return { structuredContent: { weather: '晴' } };
  };
  const recovered = await executeMcpTool(binding, '{}', callbacks);
  assert.equal(JSON.parse(recovered).structuredContent.weather, '晴');
  assert.equal(calls, 6);

  binding.client.callTool = async () => {
    calls += 1;
    if (calls == 7) return { isError: true, structuredContent: { error: { message: 'Shared quota exceeded', data: { reason: 'rate_limited' } } } };
    return { structuredContent: {}, content: [{ type: 'text', text: '   ' }] };
  };
  await assert.rejects(executeMcpTool(binding, '{}', callbacks), /连续三次调用失败/);
  assert.equal(calls, 9, 'rate limit and blank results both consume transient retry attempts');

  binding.client.callTool = async () => {
    calls += 1;
    return { isError: true, structuredContent: { error: { message: 'longitude required', data: { reason: 'invalid_arguments' } } } };
  };
  assert.match(await executeMcpTool(binding, '{}', callbacks), /longitude required/);
  assert.equal(calls, 10, 'invalid arguments are returned to the model without retry');

  binding.remoteName = 'openmeteo_get_forecast';
  binding.client.callTool = async () => {
    calls += 1;
    return { content: [{ type: 'text', text: 'Weather forecast: no records' }], structuredContent: { record_count: 0, current: {} } };
  };
  await assert.rejects(executeMcpTool(binding, '{}', callbacks), /连续三次调用失败/);
  assert.equal(calls, 13, 'forecast metadata without weather observations is not accepted as data');
});

test('MCP discovery retries only transient failures and clears its progress card', async () => {
  const { McpRequestError } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpRequestError']);
  const { listMcpTools } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['listMcpTools'], {
    llmModelMap: new Map(), legacyWeatherToolEnabled: false, mcpServers: [], McpClient: class {}, McpRequestError,
    CustomProviderAdapter: class {}, registerCustomProvider() {}, SseStreamParser: class {},
    setTimeout(resolve) { resolve(); },
  });
  const statuses = [];
  let calls = 0;
  let cached = false;
  const client = { config: { id: 'weather', url: 'https://example.test/mcp' }, hasCachedTools() { return cached; }, async listTools() {
    calls += 1;
    if (calls < 3) throw new McpRequestError('timeout', true);
    cached = true;
    return [{ name: 'forecast' }];
  } };
  const tools = await listMcpTools(client, { onToolStatus(status) { statuses.push(status); } });
  assert.equal(tools[0].name, 'forecast');
  assert.equal(calls, 3);
  assert.deepEqual(statuses, ['天气查询工具 · 连接天气服务 · 正在连接', '天气查询工具 · 连接天气服务 · 首次连接失败，正在第 1 次重试', '天气查询工具 · 连接天气服务 · 再次连接失败，正在第 2 次重试', '天气查询工具 · 确定查询步骤 · 服务已连接，正在等待模型选择工具']);

  await listMcpTools(client, { onToolStatus(status) { statuses.push(status); } });
  assert.equal(statuses.length, 4, 'cached discovery does not flash a connection card');

  cached = false;
  client.listTools = async () => { calls += 1; throw new McpRequestError('unauthorized'); };
  await assert.rejects(listMcpTools(client, { onToolStatus() {} }), /unauthorized/);
  assert.equal(calls, 5);
});

test('a model HTTP error replaces the pending MCP card with an error', async () => {
  const events = [];
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true }] }]]),
    legacyWeatherToolEnabled: false,
    mcpServers: [{ id: 'weather', url: 'https://example.test/mcp', tools: ['openmeteo_search_locations'] }],
    McpClient: class {
      constructor(config) { this.config = config; }
      hasCachedTools() { return false; }
      async listTools() { return [{ name: 'openmeteo_search_locations', inputSchema: { type: 'object' } }]; }
    },
    McpRequestError: class extends Error {}, CustomProviderAdapter: class {}, SseStreamParser: TestSseParser,
    registerCustomProvider() {},
    uni: { request(options) {
      queueMicrotask(() => options.success({ statusCode: 429, data: '{"error":"rate limit"}' }));
      return { onChunkReceived() {} };
    } },
  });
  const success = await new QiniuToolAdapter().request([{ role: 'user', content: '北京天气' }], 'test', 'chat', {
    onToolStatus(status) { events.push(status); },
    onError(error) { events.push(error.errMsg); },
  });
  assert.equal(success, false);
  assert.deepEqual(events, [
    '天气查询工具 · 连接天气服务 · 正在连接',
    '天气查询工具 · 确定查询步骤 · 服务已连接，正在等待模型选择工具',
    'Error: 模型请求失败（HTTP 429）',
    '',
  ]);
});
