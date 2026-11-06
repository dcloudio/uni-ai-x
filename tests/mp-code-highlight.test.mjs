import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../uni_modules/uni-highlight/utssdk/mp-weixin/basic-code-tokenizer.js', import.meta.url), 'utf8')
const context = vm.createContext({ module: { exports: {} }, exports: {} })
vm.runInContext(
  source.replace('export default { tokenizeCode }', 'module.exports = { tokenizeCode }'),
  context,
  { filename: 'basic-code-tokenizer.js' }
)
const { tokenizeCode } = context.module.exports

function originalText(lines) {
  return lines.map(line => line.map(token => token.text).join('')).join('\n')
}

test('mini program highlighter preserves every source character', () => {
  const samples = [
    ['javascript', 'const value = `hello ${name}`; // note\n\nalert(value)\n'],
    ['html', '<div class="card">中文 &amp; text</div>'],
    ['python', 'def greet(name):\n    return "你好, " + name'],
    ['javascript', '/* multi\nline */\nconst x = 1'],
    ['json', '{"ok": true, "count": 2}'],
    ['unknown', 'raw <text> & symbols\nnext line']
  ]
  for (const [language, source] of samples) {
    assert.equal(originalText(tokenizeCode(source, language)), source, language)
  }
})

test('mini program highlighter colors common code and leaves unknown languages readable', () => {
  const javascript = tokenizeCode('const count = 42; // note', 'javascript')[0]
  assert.ok(javascript.some(token => token.text === 'const' && token.className === 'keyword'))
  assert.ok(javascript.some(token => token.text === '42' && token.className === 'constant'))
  assert.ok(javascript.some(token => token.text === '// note' && token.className === 'comment'))
  const python = tokenizeCode('def greet(name):\n  # note', 'python')
  assert.ok(python[1].some(token => token.text === '# note' && token.className === 'comment'))

  const plain = tokenizeCode('some code', 'unknown')[0]
  assert.equal(plain.length, 1)
  assert.equal(plain[0].className, '')
})
