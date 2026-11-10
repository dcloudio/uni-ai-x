import { createWriteStream, writeFileSync } from 'node:fs';

const count = Number(process.argv[2] ?? 15);
const output = process.argv[3] ?? '/private/tmp/uni-ai-x-weather-15.ndjson';
const timeoutMs = Number(process.env.WEATHER_RUN_TIMEOUT_MS ?? 90000);
const screenshotPath = process.env.WEATHER_SCREENSHOT ?? '';
const expectedModel = 'deepseek/deepseek-v4.1-flash';
const log = createWriteStream(output, { flags: 'w' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (value, max = 1200) => String(value ?? '').slice(0, max);
const write = (event) => log.write(JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = targets.find((item) => item.url.startsWith('http://localhost:5173/'));
if (!target) throw new Error('No Chrome tab for http://localhost:5173/');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let commandId = 0;
let activeRun = 0;
const pending = new Map();
const requests = new Map();
const runs = [];
let screenshotCount = 0;

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

function requestKind(url) {
  if (url.includes('open-meteo.caseyjhand.com/mcp')) return 'mcp';
  if (url.includes('/chat/completions')) return 'model';
  if (!url.startsWith('http://localhost:5173/') && !url.startsWith('ws://localhost:5173/')) return 'external';
  return 'asset';
}

function requestDetails(kind, body) {
  if (kind !== 'mcp' && kind !== 'model') return {};
  try {
    const data = JSON.parse(body ?? '{}');
    if (kind === 'mcp') return { rpcMethod: data.method, tool: data.params?.name, arguments: data.params?.arguments };
    return { model: data.model, messageCount: data.messages?.length, toolChoice: data.tool_choice };
  } catch { return { invalidRequestJson: true }; }
}

function responseDetails(kind, body, status) {
  if (kind === 'external') return { body: '[redacted: external response may contain credentials]' };
  if (kind === 'model') return { bytes: body.length,
    errorBody: status >= 400 ? clip(body, 1200) : null,
    toolCalls: [...new Set([...body.matchAll(/"name"\s*:\s*"(weather__[^"]+)"/g)].map((match) => match[1]))] };
  if (kind !== 'mcp') return {};
  const messages = body.trim().startsWith('{')
    ? [JSON.parse(body)]
    : body.split('\n').filter((line) => line.startsWith('data:')).map((line) => JSON.parse(line.slice(5).trim()));
  const response = messages.find((message) => message.result != null || message.error != null);
  const result = response?.result;
  return {
    rpcError: response?.error ?? null,
    isError: result?.isError ?? false,
    structuredKeys: Object.keys(result?.structuredContent ?? {}),
    structuredError: result?.structuredContent?.error ?? null,
    content: clip(result?.content?.filter((part) => part.type === 'text').map((part) => part.text).join('\n') ?? '', 1800),
  };
}

ws.onmessage = async ({ data }) => {
  const event = JSON.parse(data);
  if (event.id && pending.has(event.id)) {
    const waiter = pending.get(event.id);
    pending.delete(event.id);
    event.error ? waiter.reject(new Error(event.error.message)) : waiter.resolve(event.result);
    return;
  }
  const params = event.params ?? {};
  if (event.method === 'Network.requestWillBeSent') {
    const kind = requestKind(params.request.url);
    if (kind === 'asset') return;
    const request = { run: activeRun, kind, url: params.request.url, method: params.request.method,
      ...requestDetails(kind, params.request.postData) };
    requests.set(params.requestId, request);
    if (activeRun > 0) runs[activeRun - 1].requests.push(request);
    write({ type: 'request', ...request });
  } else if (event.method === 'Network.responseReceived') {
    const request = requests.get(params.requestId);
    if (request) {
      request.status = params.response.status;
      write({ type: 'response', run: request.run, kind: request.kind, rpcMethod: request.rpcMethod,
        tool: request.tool, status: request.status, url: request.url,
        retryAfter: params.response.headers?.['retry-after'] ?? params.response.headers?.['Retry-After'] ?? null });
    }
  } else if (event.method === 'Network.loadingFinished') {
    const request = requests.get(params.requestId);
    if (request) {
      try {
        const body = await command('Network.getResponseBody', { requestId: params.requestId });
        write({ type: 'responseBody', run: request.run, kind: request.kind, rpcMethod: request.rpcMethod,
          tool: request.tool, ...responseDetails(request.kind, body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body ?? '', request.status ?? 0) });
      } catch (error) { write({ type: 'responseBodyError', run: request.run, error: String(error) }); }
      requests.delete(params.requestId);
    }
  } else if (event.method === 'Network.loadingFailed') {
    const request = requests.get(params.requestId);
    if (request) {
      write({ type: 'requestFailed', run: request.run, kind: request.kind, rpcMethod: request.rpcMethod,
        tool: request.tool, error: params.errorText });
      requests.delete(params.requestId);
    }
  } else if (event.method === 'Runtime.consoleAPICalled') {
    const message = params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
    if (message.includes('[uni-ai-x][mcp]') || message.includes('[uni-ai-x][weather]') ||
      message.includes('[uni-ai-x][model]') || message.includes('[uni-ai-x][tools]') || params.type === 'error') {
      write({ type: 'console', run: activeRun, level: params.type, message: clip(message, 2400) });
    }
  } else if (event.method === 'Runtime.exceptionThrown') {
    write({ type: 'exception', run: activeRun, message: clip(params.exceptionDetails?.text) });
  }
};

await command('Runtime.enable');
await command('Network.enable');
const snapshot = `(() => ({
  processing: !!document.querySelector('.input-tool-bar-stop'),
  example: [...document.querySelectorAll('.chat-box-welcome-demo-btn')].some((node) => node.innerText.trim() === '查天气'),
  segments: [...document.querySelectorAll('.msg-segment-first')].map((node) => node.innerText.trim()).filter(Boolean),
  answerVisible: [...document.querySelectorAll('.msg-segment-first .uni-ai-md-rich-text,.msg-segment-first .msg-root-plain-text')].some((node) => node.innerText.trim().length > 0),
  retryCards: [...document.querySelectorAll('.weather-tool-card')].map((node) => node.innerText.trim()),
  errors: [...document.querySelectorAll('.msg-root-error-msg,.weather-tool-card-error')].map((node) => node.innerText.trim())
}))()`;

try {
  for (let number = 1; number <= count; number++) {
    if (number > 1 || !(await evaluate(snapshot)).example) {
      const opened = await evaluate(`(() => { const button = document.querySelector('.chat-box-add-chat .add-chat'); if (!button) return false; button.click(); return true })()`);
      if (!opened) throw new Error('New chat button unavailable after run ' + (number - 1));
      for (let wait = 0; wait < 40 && !(await evaluate(snapshot)).example; wait++) await sleep(250);
    }
    const run = { number, requests: [], statuses: [], result: '' };
    runs.push(run);
    activeRun = number;
    const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('.chat-box-welcome-demo-btn')].find((node) => node.innerText.trim() === '查天气'); if (!button) return false; button.click(); return true })()`);
    if (!clicked) throw new Error('Weather example unavailable for run ' + number);
    write({ type: 'runStart', run: number, prompt: '帮我查一下北京现在的天气' });
    const started = Date.now();
    let sawProcessing = false;
    let sawCard = false;
    let gapRecorded = false;
    while (Date.now() - started < timeoutMs) {
      const state = await evaluate(snapshot);
      sawProcessing ||= state.processing;
      sawCard ||= state.retryCards.length > 0;
      if (sawCard && !gapRecorded && state.processing && state.retryCards.length === 0 && !state.answerVisible) {
        gapRecorded = true;
        write({ type: 'uiGap', run: number, elapsedMs: Date.now() - started });
      }
      for (const status of state.retryCards) {
        if (!run.statuses.includes(status)) {
          run.statuses.push(status);
          write({ type: 'uiStatus', run: number, status });
          if (screenshotPath && screenshotCount < 6) {
            const screenshot = await command('Page.captureScreenshot', { format: 'png' });
            screenshotCount += 1;
            const path = screenshotPath.replace(/\.png$/, `-${screenshotCount}.png`);
            writeFileSync(path, Buffer.from(screenshot.data, 'base64'));
          }
        }
      }
      if (sawProcessing && !state.processing && state.segments.length > 0) {
        run.result = state.segments.at(-1);
        run.errors = state.errors;
        run.elapsedMs = Date.now() - started;
        break;
      }
      await sleep(250);
    }
    if (!run.result) { run.result = '[timeout]'; run.elapsedMs = Date.now() - started; }
    await sleep(500);
    const calls = run.requests.filter((request) => request.kind === 'mcp' && request.rpcMethod === 'tools/call');
    const models = run.requests.filter((request) => request.kind === 'model' && request.method === 'POST');
    run.ok = !run.errors?.length && run.result !== '[timeout]' && calls.length > 0 &&
      models.every((request) => request.model === expectedModel) && /北京|Beijing/.test(run.result) &&
      !/查到如下|查询结果如下/.test(run.result.slice(-50));
    write({ type: 'runEnd', run: number, ok: run.ok, uiGap: gapRecorded, elapsedMs: run.elapsedMs,
      modelRequests: models.length, mcpCalls: calls.map((request) => request.tool),
      statuses: run.statuses, errors: run.errors ?? [], answer: clip(run.result, 2000) });
    console.log(`${number}/${count} ${run.ok ? 'OK' : 'CHECK'} ${run.elapsedMs}ms model=${models.length} mcp=${calls.map((call) => call.tool).join(',')} ${clip(run.result.replaceAll('\n', ' '), 100)}`);
    if (number < count) await sleep(2000);
  }
  const summary = { count, ok: runs.filter((run) => run.ok).length, failed: runs.filter((run) => !run.ok).length,
    output, totalModelRequests: runs.reduce((sum, run) => sum + run.requests.filter((request) => request.kind === 'model' && request.method === 'POST').length, 0),
    totalMcpCalls: runs.reduce((sum, run) => sum + run.requests.filter((request) => request.kind === 'mcp' && request.rpcMethod === 'tools/call').length, 0) };
  write({ type: 'summary', ...summary });
  console.log(JSON.stringify(summary));
} finally {
  ws.close();
  log.end();
}
