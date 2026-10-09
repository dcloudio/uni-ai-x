import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

test('SSE emits before completion and preserves Chinese characters split across network chunks', () => {
  let source = readFileSync(new URL('../uni_modules/uni-ai-worker/utssdk/sse.uts', import.meta.url), 'utf8');
  source = source.replace(/\/\/ #ifdef APP-HARMONY[\s\S]*?\/\/ #endif/g, '').replaceAll('Number.from(separatorIndex)', 'Number(separatorIndex)');
  source = source.replace(/^export /gm, '');
  const context = vm.createContext({ TextDecoder, Uint8Array });
  vm.runInContext(stripTypeScriptTypes(source) + '\nthis.Decoder = SSEStreamDecoder;', context);
  const received = [];
  let done = 0;
  const decoder = new context.Decoder(data => received.push(data), () => done++);
  const first = new TextEncoder().encode('data: {"text":"中文"}\r\n\r\n');
  for (const byte of first) decoder.push(new Uint8Array([byte]).buffer);
  assert.deepEqual(received, ['{"text":"中文"}']);
  assert.equal(done, 0);
  decoder.push(new TextEncoder().encode('data: second\n\ndata: [DONE]\n\n').buffer);
  decoder.finish();
  assert.deepEqual(received, ['{"text":"中文"}', 'second']);
  assert.equal(done, 1);
});

test('buffered response fallback emits once; aborted requests cannot publish late data', () => {
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
    .replace(/\/\/ #ifdef APP-HARMONY[\s\S]*?\/\/ #endif/g, '')
    .replaceAll('Number.from(separatorIndex)', 'Number(separatorIndex)');
  let request;
  const context = vm.createContext({ TextDecoder, TextEncoder, Uint8Array, console,
    uni: { request: options => { request = options; return { onChunkReceived() {}, abort() {} }; } }
  });
  vm.runInContext(stripTypeScriptTypes(read('../uni_modules/uni-ai-worker/utssdk/sse.uts') + '\n' + read('../uni_modules/uni-ai-worker/utssdk/stream-request.uts')) + '\nthis.Request = WorkerStreamRequest;', context);
  const received = [];
  const completions = [];
  const runner = new context.Request(data => received.push(data), () => assert.fail('Unexpected error'), (...args) => completions.push(args));
  runner.start('url', 'token', '{}');
  const body = 'data: hello\n\ndata: [DONE]\n\n';
  request.success({ statusCode: 200, data: body });
  assert.deepEqual(received, ['hello']);
  assert.equal(completions.length, 1);
  assert.equal(completions[0][1], 0);
  assert.equal(completions[0][2], body.length);
  runner.start('url', 'token', '{}');
  runner.abort();
  request.success({ statusCode: 200, data: body });
  assert.deepEqual(received, ['hello']);
});
