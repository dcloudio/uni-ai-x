let moduleInstance = null
let initialization = null

function stringToUtf8Bytes(text) {
  const bytes = []
  for (let index = 0; index < text.length; index++) {
    let code = text.charCodeAt(index)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff)
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        )
        index += 1
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      }
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return bytes
}

function utf8BytesToString(bytes) {
  let result = ''
  let index = 0
  while (index < bytes.length) {
    const first = bytes[index++]
    if (first < 0x80) {
      result += String.fromCharCode(first)
    } else if (first < 0xe0) {
      const second = bytes[index++]
      result += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f))
    } else if (first < 0xf0) {
      const second = bytes[index++]
      const third = bytes[index++]
      result += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f))
    } else {
      const second = bytes[index++]
      const third = bytes[index++]
      const fourth = bytes[index++]
      let codePoint = ((first & 0x07) << 18) | ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) | (fourth & 0x3f)
      codePoint -= 0x10000
      result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff))
    }
  }
  return result
}

async function createModule() {
  let memory = null
  const imports = {
    env: {
      __assert_fail: () => { throw new Error('cmark-gfm WebAssembly assertion failed') },
      _abort_js: () => { throw new Error('cmark-gfm WebAssembly aborted') },
      emscripten_notify_memory_growth: () => {},
      emscripten_resize_heap: requestedSize => {
        if (memory == null) return 0
        const currentSize = memory.buffer.byteLength
        if (requestedSize <= currentSize) return 1
        try {
          memory.grow(Math.ceil((requestedSize - currentSize) / 65536))
          return 1
        } catch (_error) {
          return 0
        }
      }
    },
    wasi_snapshot_preview1: {
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      fd_close: () => 0,
      fd_seek: () => 0,
      fd_write: () => 0
    }
  }
  const result = await WXWebAssembly.instantiate(
    '/uni_modules/uni-cmark/static/mp-weixin/cmark-gfm-md2html.wasm',
    imports
  )
  const exports = result.instance.exports
  memory = exports.memory
  exports._initialize()
  return exports
}

function init() {
  if (moduleInstance != null) return Promise.resolve()
  if (initialization != null) return initialization
  initialization = createModule().then(exports => {
    moduleInstance = exports
  })
  return initialization
}

function md2html(markdown) {
  if (moduleInstance == null) throw new Error('cmark-gfm WebAssembly module is not initialized')
  const input = stringToUtf8Bytes(markdown)
  const inputPointer = moduleInstance.malloc(input.length + 1)
  let heap = new Uint8Array(moduleInstance.memory.buffer)
  heap.set(input, inputPointer)
  heap[inputPointer + input.length] = 0
  try {
    const htmlPointer = moduleInstance.uni_cmark_markdown_to_html(inputPointer, input.length, 0)
    if (htmlPointer === 0) throw new Error('cmark-gfm failed to convert Markdown to HTML')
    try {
      heap = new Uint8Array(moduleInstance.memory.buffer)
      const output = []
      for (let pointer = htmlPointer; heap[pointer] !== 0; pointer++) output.push(heap[pointer])
      return utf8BytesToString(output)
    } finally {
      moduleInstance.uni_cmark_free_html(htmlPointer)
    }
  } finally {
    moduleInstance.free(inputPointer)
  }
}

export default { init, md2html }
