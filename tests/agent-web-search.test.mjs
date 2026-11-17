import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

test('agent searches repeatedly, reads a result, and preserves stable citation IDs', async () => {
  const requests = [];
  const searches = [];
  let round = 0;
  let searchRound = 0;
  const actions = [
    { name: 'search_web', arguments: '{"query":"first"}' },
    { name: 'search_web', arguments: '{"query":"second"}' },
    { name: 'read_web_link', arguments: '{"url":"https://example.test/2"}' },
  ];
  const uni = { request(options) {
    requests.push({ url: options.url, data: structuredClone(options.data) });
    let receive;
    queueMicrotask(() => {
      if (options.url.endsWith('/tools/search')) {
        const results = [1, ++searchRound].map(id => ({ title: 'Source ' + id, url: 'https://example.test/' + id, content: 'Fact ' + id }));
        options.success({ statusCode: 200, data: { results } });
        return;
      }
      if (options.url.endsWith('/tools/fetch')) {
        options.success({ statusCode: 200, data: { title: 'Source 2', content: 'Detailed fact 2' } });
        return;
      }
      const action = actions[round++];
      const delta = action ? { tool_calls: [{ index: 0, id: 'call-' + round, type: 'function', function: action }] } : { content: 'Answer [1][2]' };
      receive({ data: new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\ndata: [DONE]\n\n').buffer });
      options.success({ statusCode: 200, data: '' });
    });
    return { onChunkReceived(fn) { receive = fn; }, abort() {} };
  } };
  const webSearchModule = loadUts('uni_modules/uni-ai-x/sdk/web-search.uts', ['webSearch', 'normalizeSearchSources'], { uni });
  const { readWebLink } = loadUts('uni_modules/uni-ai-x/sdk/web-reader.uts', ['readWebLink'], { uni });
  const { SseStreamParser } = loadUts('uni_modules/uni-ai-x/sdk/sse.uts', ['SseStreamParser'], {
    TextDecoder, Uint8Array, utils: { runOnDispatcher(_name, fn) { fn(); } }, console,
  });
  const { QiniuToolAdapter } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['QiniuToolAdapter'], {
    uni, console, ...webSearchModule, readWebLink, SseStreamParser,
    CustomProviderAdapter: class {}, mcpServers: [], McpClient: class {}, McpRequestError: class extends Error {},
    llmModelMap: new Map([['qiniu', { baseURL: '/chat', getToken: async () => 'token', models: [{ modelId: 'test', toolCall: true, thinking: true }] }]]),
  }, ['WEB']);
  const ok = await new QiniuToolAdapter().request([{ role: 'user', content: 'Research this' }], 'test', 'chat', {
    webSearch: true,
    onSearch(value) { searches.push(structuredClone(value)); },
    onError(error) { assert.fail(JSON.stringify(error)); },
  }, true);
  assert.equal(ok, true);
  assert.equal(round, 4);
  assert.equal(requests.filter(r => r.url.endsWith('/tools/search')).length, 2);
  assert.equal(requests.filter(r => r.url.endsWith('/tools/fetch')).length, 1);
  assert.equal(requests[0].data.thinking.type, 'enabled');
  assert.ok(requests[0].data.tools.some(tool => tool.function.name === 'search_web'));
  assert.deepEqual(Array.from(searches.at(-1).sources, source => source.id), [1, 2]);
  const finalHistory = requests.at(-1).data.messages;
  assert.equal(JSON.parse(finalHistory.at(-1).content).content, 'Detailed fact 2');
});
