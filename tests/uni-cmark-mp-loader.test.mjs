import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../uni_modules/uni-cmark/utssdk/mp-weixin/cmark-gfm-loader.js', import.meta.url), 'utf8')
  .replace('export default { init, md2html, md2json }', 'module.exports = { init, md2html, md2json }')
const wasm = readFileSync(new URL('../uni_modules/uni-cmark/static/mp-weixin/cmark-gfm-md2html.wasm', import.meta.url))

test('WeChat cmark loader shares its initialized WASM across module contexts', async () => {
  const sharedGlobal = {}
  let instantiations = 0
  const WXWebAssembly = {
    instantiate: async (_path, imports) => {
      instantiations++
      return WebAssembly.instantiate(wasm, imports)
    }
  }
  const load = () => {
    const module = { exports: {} }
    vm.runInNewContext(source, { module, globalThis: sharedGlobal, WXWebAssembly, Uint8Array, Math, Promise })
    return module.exports
  }

  const first = load()
  await first.init()
  const second = load()
  await second.init()

  assert.equal(instantiations, 1)
  assert.equal(second.md2html('**中文**'), '<p><strong>中文</strong></p>\n')
  assert.match(second.md2json('# 标题'), /标题/)
})
