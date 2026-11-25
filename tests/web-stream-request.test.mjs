import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const source = fs.readFileSync(new URL('../uni_modules/uni-ai-x/sdk/web-stream-request.js', import.meta.url), 'utf8')
const { requestWebStream } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
function options(extra = {}) { return { url: 'https://example.test/stream', timeout: 1000, ...extra } }

test('cancellation consumes pending reader rejection and completes once', async () => {
  const original = globalThis.fetch
  let failures = [], completes = 0, gotChunk
  const first = new Promise(resolve => { gotChunk = resolve })
  globalThis.fetch = async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('first'))
      signal.addEventListener('abort', () => controller.error(signal.reason))
    }
  }))
  try {
    const task = requestWebStream(options({ fail: e => failures.push(e), complete: () => completes++ }))
    task.onChunkReceived(gotChunk)
    await first
    task.abort(); task.abort()
    await wait(20)
    assert.equal(failures.length, 1)
    assert.equal(failures[0].errCode, 600003)
    assert.equal(completes, 1)
  } finally { globalThis.fetch = original }
})

test('preserves split UTF-8 chunks, response status, headers and POST data', async () => {
  const original = globalThis.fetch
  const encoded = new TextEncoder().encode('你好SSE')
  let observed, result, parts = [], complete = 0
  globalThis.fetch = async (_url, init) => {
    observed = init
    return new Response(new ReadableStream({ start(c) { c.enqueue(encoded.slice(0, 2)); c.enqueue(encoded.slice(2)); c.close() } }), { status: 201, headers: { 'X-Test': 'yes' } })
  }
  try {
    await new Promise((resolve, reject) => {
      const task = requestWebStream(options({ method: 'POST', data: { a: 1 }, header: { Authorization: 'test' }, success: r => { result = r }, fail: reject, complete: () => { complete++; resolve() } }))
      task.onChunkReceived(e => parts.push(e.data))
    })
    assert.equal(result.data, '你好SSE')
    assert.equal(result.statusCode, 201)
    assert.equal(result.header['x-test'], 'yes')
    assert.equal(observed.body, '{"a":1}')
    assert.equal(observed.headers.Authorization, 'test')
    assert.equal(parts.length, 2)
    assert.equal(complete, 1)
  } finally { globalThis.fetch = original }
})

test('actual read failure reaches fail once without success', async () => {
  const original = globalThis.fetch
  let success = false, failure
  globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { c.error(new Error('connection reset')) } }))
  try {
    await new Promise(resolve => requestWebStream(options({ success: () => { success = true }, fail: e => { failure = e }, complete: resolve })))
    assert.equal(success, false)
    assert.match(failure.errMsg, /connection reset/)
    assert.equal(failure.errCode, 5)
  } finally { globalThis.fetch = original }
})

test('timeout aborts pending fetch and releases timer without double completion', async () => {
  const original = globalThis.fetch
  let failures = [], complete = 0
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  try {
    await new Promise(resolve => requestWebStream(options({ timeout: 10, fail: e => failures.push(e), complete: () => { complete++; resolve() } })))
    await wait(10)
    assert.deepEqual(failures, [{ errMsg: 'request:fail timeout', errCode: 5 }])
    assert.equal(complete, 1)
  } finally { globalThis.fetch = original }
})
