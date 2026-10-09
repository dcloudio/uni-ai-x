import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function load(file, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext(globals);
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context;
}
const citations = load('../uni_modules/uni-ai-x/sdk/search-citations.uts');
const search = load('../uni_modules/uni-ai-x/sdk/web-search.uts');
const sources = [{ id: 1 }, { id: 2 }];

test('citations in paragraphs and table cells become individually clickable; unknown IDs stay text', () => {
  const html = citations.linkSearchCitations('<p>资料[1][2][9]</p><table><tr><td>[2]</td></tr></table>', sources);
  assert.equal((html.match(/href=/g) ?? []).length, 3);
  assert.match(html, /\[9\]/);
  assert.equal(citations.citationNumber('#uni-ai-source-2'), 2);
  assert.equal(citations.citationNumber('https://example.com/#uni-ai-source-2'), 0);
});

test('code, existing links, comments, attributes and partial streaming references stay intact', () => {
  const html = '<p title="[1] > x">[</p><pre><code>[1]</code></pre><code>[2]</code><a href="https://x.test?q=[1]">[2]</a><!-- [1] -->';
  assert.equal(citations.linkSearchCitations(html, sources), html);
  assert.equal(citations.linkSearchCitations('<p>[1]</p>', []), '<p>[1]</p>');
  const once = citations.linkSearchCitations('<p>[1]</p>', sources);
  assert.equal(citations.linkSearchCitations(once, sources), once);
});

test('source numbering is assigned after URL validation and deduplication', () => {
  const result = search.normalizeSearchSources([
    { url: 'javascript:alert(1)' }, { url: ' https://example.com/a#one ', title: 'A' },
    { url: 'https://example.com/a#two' }, { url: 'https://example.com/b?q=1&x=2', content: 'x'.repeat(7000) },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[1].id, 2);
  assert.equal(result[1].content.length, 6000);
  assert.match(search.buildWebSearchContext(result), /\[2\]/);
});

test('search context injection does not mutate original messages or multimodal parts', () => {
  const parts = [{ type: 'text', text: '问题' }, { type: 'image_url', image_url: { url: 'image' } }];
  const messages = [{ role: 'user', content: parts }];
  const enriched = search.injectWebSearchContext(messages, '资料');
  assert.equal(parts.length, 2);
  assert.equal(enriched[0].content.length, 3);
  assert.equal(enriched[0].content[2].text, '资料');
});

test('search exposes cancellation and a bounded timeout, rejects HTTP failures', async () => {
  let request;
  const task = { abort() {} };
  const api = load('../uni_modules/uni-ai-x/sdk/web-search.uts', { uni: { request: options => { request = options; return task; } } });
  let receivedTask;
  const result = api.webSearch('q', 'token', 'https://example.com/search', 8, value => { receivedTask = value; });
  assert.equal(receivedTask, task);
  assert.equal(request.timeout, 20000);
  request.success({ statusCode: 503, data: {} });
  await assert.rejects(result, /503/);
});

test('aborting during search discards a late response and never starts the model', async () => {
  let resolveSearch;
  let aborted = 0;
  const events = [];
  let source = readFileSync(new URL('../uni_modules/uni-ai-x/sdk/requestAiRunner.uts', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from [^\n]*\n/gm, '').replace(/^export default .*$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({
    llmModelMap: new Map([['fixture', { webSearchURL: 'url', getToken: async () => 'token' }]]),
    lastUserQuestionText: () => 'question', console, clearTimeout, clearInterval,
    destroyAiWorkerRuntime() {}, cancelAiWorkerRequest() {}, setAiWorkerDataListener() {},
    webSearch: (_q, _t, _u, _max, onTask) => {
      onTask({ abort: () => aborted++ });
      return new Promise(resolve => { resolveSearch = resolve; });
    },
  });
  vm.runInContext(stripTypeScriptTypes(source) + '\nthis.Runner = RequestAiRunner;', context);
  const runner = new context.Runner({ onSearch: search => events.push(search.status), onState() {} });
  let modelCalls = 0;
  runner.requestRemoteAi = () => modelCalls++;
  const pending = runner.searchThenRequestAi([], { provider: 'fixture' }, 'chat');
  await new Promise(resolve => setImmediate(resolve));
  runner.abortRequest();
  resolveSearch([]);
  await pending;
  assert.equal(aborted, 1);
  assert.deepEqual(events, ['searching', 'cancelled']);
  assert.equal(modelCalls, 0);
});
