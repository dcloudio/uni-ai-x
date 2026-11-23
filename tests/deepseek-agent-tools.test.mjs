import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function harness(rounds, discoveryError = null) {
  const requests = [];
  const confirmations = [];
  const remote = [];
  const webRequests = [];
  const llmModelMap = new Map([['deepseek', {
    baseURL: 'https://api.deepseek.com/chat/completions',
    getToken: async () => 'official-test-token',
    models: [{ modelId: 'deepseek-flash', thinking: true, toolCall: true }, { modelId: 'deepseek-v4-pro', thinking: true, toolCall: true }],
  }]]);
  const { SseStreamParser } = loadUts('uni_modules/uni-ai-x/sdk/sse.uts', ['SseStreamParser'], {
    TextDecoder, Uint8Array, console, utils: { runOnDispatcher(_name, fn) { fn(); } },
  });
  const uni = { request(options) {
    assert.equal(options.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.header.Authorization, 'Bearer official-test-token');
    requests.push(structuredClone(options.data));
    const chunks = rounds.shift();
    assert.ok(chunks, 'unexpected model round');
    let receive;
    queueMicrotask(() => {
      for (const choice of chunks) receive({ data: new TextEncoder().encode('data: ' + JSON.stringify({ choices: [choice] }) + '\n\n').buffer });
      receive({ data: new TextEncoder().encode('data: [DONE]\n\n').buffer });
      options.success({ statusCode: 200, data: '' });
    });
    return { onChunkReceived(fn) { receive = fn; } };
  } };
  const shared = { uni, llmModelMap, SseStreamParser, CustomProviderAdapter: class {}, console };
  const { DeepSeekAppAdapter } = loadUts('uni_modules/uni-ai-x/sdk/deepseek-app-adapter.uts', ['DeepSeekAppAdapter'], {
    ...shared, supportsDeepSeekApps: () => false,
  });
  const { AgentToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['AgentToolAdapter'], {
    ...shared, DeepSeekAppAdapter,
    webSearch: async (query, token, url) => { webRequests.push({ query, token, url }); return [{ title: 'Official', url: 'https://example.test', content: 'Verified' }]; },
    normalizeSearchSources: sources => sources,
    readWebLink: async (args, token, callbacks, url) => { webRequests.push({ args, token, url }); return JSON.stringify({ content: 'Read page' }); },
    mcpServers: [{ id: 'weather', url: 'https://example.test/mcp' }],
    McpRequestError: class extends Error {},
    McpClient: class {
      constructor(config) { this.config = config; }
      hasCachedTools() { return false; }
      async listTools() { if (discoveryError) throw discoveryError; return [{ name: 'forecast', inputSchema: { type: 'object' } }]; }
      async callTool(name, args) { remote.push({ name, args }); return { content: [{ type: 'text', text: 'Sunny, 12 C' }] }; }
    },
  });
  return { adapter: new AgentToolAdapter('deepseek'), requests, confirmations, remote, webRequests };
}

const call = (name, args, id = name) => ({ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } });

test('official weather completes MCP rounds with reasoning and server signatures, without mixing server web tools', async () => {
  const steps = [{ calls: [{ signature: 'opaque-signature' }] }];
  const h = harness([
    [{ delta: { reasoning_content: 'Need weather.', server_tool_calls: steps } }, call('enable_mcp__weather', {})],
    [call('weather__forecast', { city: 'Beijing' })],
    [{ delta: { content: 'Sunny, 12 C' } }],
  ]);
  let done = 0;
  assert.equal(await h.adapter.request([{ role: 'user', content: '北京天气' }, { role: 'assistant', content: '' }], 'deepseek-flash', 'chat', {
    webSearch: true, onDone() { done++; }, onError(error) { assert.fail(JSON.stringify(error)); },
  }), true);
  assert.equal(done, 1);
  assert.equal(h.requests.length, 3);
  assert.equal(h.remote[0].name, 'forecast');
  assert.equal(h.requests[1].messages.find(m => m.role === 'assistant').reasoning_content, 'Need weather.');
  assert.equal(h.requests[1].messages.find(m => m.role === 'assistant').server_tool_calls[0].calls[0].signature, 'opaque-signature');
  assert.equal(h.requests[2].messages.at(-1).tool_call_id, 'weather__forecast');
  for (const request of h.requests) {
    assert.equal(request.safety_check.level, 'high');
    assert.ok(!request.tools.some(t => t.type === 'deepseek_web_search'));
    assert.ok(!request.tools.some(t => t.type === 'deepseek_read_url'));
    assert.ok(request.tools.some(t => t.function?.name === 'search_web'));
    assert.ok(request.tools.some(t => t.function?.name === 'read_web_link'));
  }
});

test('official Flash and Pro defer calendar creation to the confirmation card', async () => {
  const start = new Date(Date.now() + 3600000);
  const pad = n => String(n).padStart(2, '0');
  const startAt = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
  for (const model of ['deepseek-flash', 'deepseek-v4-pro']) {
    const h = harness([[call('create_calendar_reminder', { title: '测试日程', start_at: startAt })]]);
    assert.equal(await h.adapter.request([{ role: 'user', content: '创建日程' }], model, 'chat', {
      onToolConfirm(details) { h.confirmations.push(details); }, onError(error) { assert.fail(JSON.stringify(error)); },
    }), true);
    assert.equal(h.confirmations[0].state, 'pending');
    assert.equal(h.confirmations[0].title, '测试日程');
    assert.equal(h.requests.length, 1);
    assert.equal(h.remote.length, 0);
  }
});

test('official safety refusal prevents execution of returned local tools', async () => {
  const h = harness([[call('enable_mcp__weather', {}), { finish_reason: 'content_filter', delta: {} }]]);
  const errors = [];
  assert.equal(await h.adapter.request([{ role: 'user', content: 'test' }], 'deepseek-flash', 'chat', {
    onDone() { assert.fail('refused request completed'); }, onError(error) { errors.push(error); },
  }), false);
  assert.equal(errors[0].errCode, 'content_filter');
  assert.equal(h.remote.length, 0);
});

test('invalid calendar arguments can be corrected in the next model round', async () => {
  const start = new Date(Date.now() + 3600000);
  const pad = n => String(n).padStart(2, '0');
  const startAt = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const h = harness([
    [call('create_calendar_reminder', { title: '提醒', start_at: 'invalid' })],
    [call('create_calendar_reminder', { title: '提醒', start_at: startAt })],
  ]);
  const errors = [];
  assert.equal(await h.adapter.request([{ role: 'user', content: '创建提醒' }], 'deepseek-flash', 'chat', {
    onToolConfirm(value) { h.confirmations.push(value); }, onError(value) { errors.push(value); },
  }), true);
  assert.equal(h.confirmations.length, 1);
  assert.ok(h.requests[1].tools.some(tool => tool.function?.name === 'create_calendar_reminder'));
  assert.deepEqual(errors, []);
});

test('weather discovery failure preserves an independent pending calendar confirmation', async () => {
  const start = new Date(Date.now() + 3600000);
  const pad = n => String(n).padStart(2, '0');
  const startAt = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const calendar = call('create_calendar_reminder', { title: '提醒', start_at: startAt }).delta.tool_calls[0];
  const weather = call('enable_mcp__weather', {}).delta.tool_calls[0];
  weather.index = 1;
  const h = harness([[{ delta: { tool_calls: [calendar, weather] } }]], new Error('天气查询超时'));
  const errors = [];
  assert.equal(await h.adapter.request([{ role: 'user', content: '查天气并创建提醒' }], 'deepseek-flash', 'chat', {
    onToolConfirm(value) { h.confirmations.push(value); }, onError(value) { errors.push(value); },
  }), false);
  assert.match(errors[0].errMsg, /天气查询超时/);
  assert.equal(h.confirmations.length, 1);
});

test('weather rounds separate the prelude from the final Markdown answer and clear progress before content', async () => {
  const h = harness([
    [{ delta: { content: '我先查天气。' } }, call('enable_mcp__weather', {})],
    [call('weather__forecast', { city: 'Beijing' })],
    [{ delta: { content: '# 北京天气\n' } }, { delta: { content: '晴' } }],
  ]);
  let body = '';
  let status = '';
  assert.equal(await h.adapter.request([{ role: 'user', content: '北京天气' }], 'deepseek-flash', 'chat', {
    onToolStatus(value) { status = value; },
    onChunk(chunk) {
      const content = chunk.choices?.[0]?.delta?.content ?? '';
      if (content.startsWith('#')) assert.equal(status, '');
      body += content;
    },
    onError(error) { assert.fail(JSON.stringify(error)); },
  }), true);
  assert.equal(body, '我先查天气。\n\n# 北京天气\n晴');
});

test('official agent search preserves the thinking preference and uses client tools', async () => {
  const h = harness([[{ delta: { content: 'Searched answer' } }]]);
  assert.equal(await h.adapter.request([{ role: 'user', content: 'Search official docs' }], 'deepseek-flash', 'chat', {
    webSearch: true, onError(error) { assert.fail(JSON.stringify(error)); },
  }, false), true);
  assert.equal(h.requests[0].thinking.type, 'disabled');
  assert.ok(!h.requests[0].tools.some(t => t.type === 'deepseek_web_search'));
  assert.ok(h.requests[0].tools.some(t => t.type === 'function'));
});


test('official agent search and reading call only the selected official APIs', async () => {
  const h = harness([
    [call('search_web', { query: 'official docs' })],
    [call('read_web_link', { url: 'https://example.test' })],
    [{ delta: { content: 'Verified answer [1]' } }],
  ]);
  assert.equal(await h.adapter.request([{ role: 'user', content: 'Search and read docs' }], 'deepseek-flash', 'chat', {
    webSearch: true, onError(error) { assert.fail(JSON.stringify(error)); },
  }, false), true);
  assert.deepEqual(h.webRequests.map(r => r.url), ['https://api.deepseek.com/v1/tools/search', 'https://api.deepseek.com/v1/tools/fetch']);
  assert.ok(h.webRequests.every(r => r.token === 'official-test-token'));
  assert.ok(h.requests.every(r => r.thinking.type === 'disabled'));
  assert.equal(JSON.parse(h.requests[2].messages.at(-1).content).content, 'Read page');
});
