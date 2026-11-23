import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function mcpHarness(request, callbacks = null) {
  let sequence = 0;
  const timers = new Map();
  const { McpClient } = loadUts('uni_modules/uni-ai-x/sdk/mcp-client.uts', ['McpClient'], {
    uni: { request }, console,
    setTimeout(fn, delay) { assert.equal(delay, 20000); timers.set(++sequence, fn); return sequence; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { client: new McpClient({ id: 'weather', url: 'https://example.test/mcp' }, callbacks), timers };
}

test('MCP registers its active task for stop and a late initialization cannot continue discovery', async () => {
  let cancelled = false;
  let options;
  let activeTask;
  let completedTask;
  let calls = 0;
  const task = { abort() {} };
  const h = mcpHarness(value => { calls++; options = value; return task; }, {
    isCancelled: () => cancelled,
    onTaskCreate(value) { activeTask = value; },
    onTaskComplete(value) { completedTask = value; },
  });
  const pending = h.client.listTools();
  assert.equal(activeTask, task);
  cancelled = true;
  options.success({ statusCode: 200, header: {}, data: JSON.stringify({ id: 1, result: { protocolVersion: '2025-06-18' } }) });
  await assert.rejects(pending, /请求已取消/);
  assert.equal(completedTask, task);
  assert.equal(calls, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.client.hasCachedTools(), false);
});

test('missing native callbacks time out once; failed abort and late success cannot resume discovery', async () => {
  let options;
  let requests = 0;
  let aborts = 0;
  const h = mcpHarness(value => {
    requests++;
    options = value;
    return { abort() { aborts++; throw new Error('UTS instance is not registered'); } };
  });
  const pending = h.client.listTools();
  const failure = assert.rejects(pending, error => {
    assert.match(error.message, /天气查询超时/);
    assert.equal(error.retryable, false);
    return true;
  });
  [...h.timers.values()][0]();
  await failure;
  options.success({ statusCode: 200, header: { 'Mcp-Session-Id': 'late-session' }, data: JSON.stringify({ jsonrpc: '2.0', id: options.data.id, result: { protocolVersion: '2025-06-18' } }) });
  options.fail({ errMsg: 'request:fail timeout' });
  assert.equal(aborts, 1);
  assert.equal(requests, 1);
  assert.equal(h.client.hasCachedTools(), false);
});

test('native timeout is terminal and cancels the independent deadline', async () => {
  let options;
  const h = mcpHarness(value => { options = value; return {}; });
  const pending = h.client.listTools();
  options.fail({ errMsg: 'request:fail timeout' });
  await assert.rejects(pending, error => /天气查询超时/.test(error.message) && !error.retryable);
  assert.equal(h.timers.size, 0);
});

test('synchronous native bridge failure clears the deadline', async () => {
  const h = mcpHarness(() => { throw new Error('native bridge unavailable'); });
  await assert.rejects(h.client.listTools(), /native bridge unavailable/);
  assert.equal(h.timers.size, 0);
});

test('expired native search and model tasks cannot block stop state or duplicate aborts', () => {
  const states = [];
  let aborts = 0;
  const { RequestAiRunner } = loadUts('uni_modules/uni-ai-x/sdk/requestAiRunner.uts', ['RequestAiRunner'], {
    setAiWorkerDataListener() {}, destroyAiWorkerRuntime() {},
  });
  const runner = new RequestAiRunner({ onState(state) { states.push(state); } });
  const task = { abort() { aborts++; throw new Error('UTS instance is not registered'); } };
  runner.searchTask = task;
  runner.requestTask = task;
  runner.abortRequest();
  assert.equal(runner.userAbort, true);
  assert.equal(runner.requestTask, null);
  assert.equal(runner.searchTask, null);
  assert.deepEqual(states, ['stop']);
  runner.abortRequest();
  assert.equal(aborts, 2);
});

test('completing a model round releases only its own native task before the next tool stage', async () => {
  let callbacks;
  const { RequestAiRunner } = loadUts('uni_modules/uni-ai-x/sdk/requestAiRunner.uts', ['RequestAiRunner'], {
    getCustomProvider() { return { async request(_messages, _model, _chat, value) { callbacks = value; return true; } }; },
  });
  const runner = new RequestAiRunner({});
  await runner.requestViaCustomProvider({ llm: { provider: 'deepseek', model: 'deepseek-flash' }, messages: [] });
  const first = {};
  const second = {};
  runner.requestTask = second;
  callbacks.onTaskComplete(first);
  assert.equal(runner.requestTask, second, 'late completion must not release a newer round');
  callbacks.onTaskComplete(second);
  assert.equal(runner.requestTask, null);
});
