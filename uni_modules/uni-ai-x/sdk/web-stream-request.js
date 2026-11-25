// Web-only transport: uni.request's chunk reader currently leaves read() rejection
// unhandled when a stream is aborted. Own the reader so cancellation is consumed
// at its source while preserving the request task callbacks used by the SDK.
export function requestWebStream(options) {
  const controller = new AbortController()
  const chunks = new Set()
  const headers = new Set()
  let settled = false
  let timer = 0
  const finish = (kind, result) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    try { options[kind]?.(result) } finally { options.complete?.(result) }
  }
  const fail = (message, errCode = 5) => finish('fail', { errMsg: 'request:fail ' + message, errCode })
  const task = {
    abort() {
      if (settled) return
      controller.abort()
      fail('abort', 600003)
    },
    onChunkReceived(listener) { chunks.add(listener) },
    offChunkReceived(listener) { listener == null ? chunks.clear() : chunks.delete(listener) },
    onHeadersReceived(listener) { headers.add(listener) },
    offHeadersReceived(listener) { listener == null ? headers.clear() : headers.delete(listener) }
  }
  timer = setTimeout(() => {
    if (settled) return
    controller.abort()
    fail('timeout')
  }, options.timeout ?? 60000)
  async function readResponse() {
    let reader
    try {
      const response = await fetch(options.url, {
        method: options.method ?? 'GET',
        headers: options.header,
        body: options.data == null ? undefined : (typeof options.data === 'string' ? options.data : JSON.stringify(options.data)),
        signal: controller.signal,
        credentials: options.withCredentials ? 'include' : 'same-origin'
      })
      if (settled) return
      const header = Object.fromEntries(response.headers.entries())
      const info = { statusCode: response.status, header, cookies: [] }
      headers.forEach(listener => listener(info))
      if (settled) return
      let text = ''
      if (response.body != null) {
        reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (!settled) {
          const { done, value } = await reader.read()
          if (settled) return
          if (done) { text += decoder.decode(); break }
          text += decoder.decode(value, { stream: true })
          chunks.forEach(listener => listener({ data: value }))
        }
      }
      if (!settled) finish('success', { ...info, data: text })
    } catch (error) {
      if (!settled) fail(error instanceof Error ? error.message : String(error))
    } finally {
      reader?.releaseLock()
    }
  }
  void readResponse()
  return task
}
