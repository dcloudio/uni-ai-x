import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// basic is the default for all mini programs. For a WeChat full build, use
// `node scripts/build-mp-weixin.mjs full`; this script stages the matching
// TextMate API and WASM, publishes, then restores the basic source files.
const root = fileURLToPath(new URL('..', import.meta.url))
const mode = process.argv[2] ?? 'basic'
if (mode !== 'basic' && mode !== 'full') {
  console.error('Usage: node scripts/build-mp-weixin.mjs [basic|full]')
  process.exit(2)
}

const selectorPath = resolve(root, 'uni_modules/uni-ai-x/sdk/parseCode.uts')
const mpApiPath = resolve(root, 'uni_modules/uni-highlight/utssdk/mp-weixin/index.uts')
const mpFullApiPath = resolve(root, 'uni_modules/uni-highlight/utssdk/mp-weixin/index-textmate.uts')
const wasmSource = resolve(root, 'static/web/uni-highlight/_onig.wasm')
const wasmTarget = resolve(root, 'uni_modules/uni-highlight/static/_onig.wasm')
const buildRoot = resolve(root, 'unpackage/dist/build/mp-weixin')
const basicSelection = "export * from './parseCode-basic.uts'\n// export * from './parseCode-textmate.uts'"
const fullSelection = "// export * from './parseCode-basic.uts'\nexport * from './parseCode-textmate.uts'"
const original = readFileSync(selectorPath, 'utf8')
const originalMpApi = readFileSync(mpApiPath, 'utf8')
if (!original.includes(basicSelection)) throw new Error('Expected the default basic highlight selection in parseCode.uts')
if (existsSync(wasmTarget)) throw new Error(`Unexpected staged WASM: ${wasmTarget}`)
if (!existsSync(wasmSource)) throw new Error(`Missing full-mode WASM: ${wasmSource}`)

function fileBytes(directory) {
  let total = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    total += entry.isDirectory() ? fileBytes(path) : statSync(path).size
  }
  return total
}

function publish() {
  const cli = process.env.HBUILDERX_CLI ?? '/Applications/HBuilderX-Dev.app/Contents/MacOS/cli'
  const appid = process.env.MP_WEIXIN_APPID ?? 'wx07597007230e3702'
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cli, [
      'publish', 'mp-weixin', '--project', root, '--appid', appid, '--upload', 'false'
    ], { cwd: root, stdio: 'inherit' })
    child.on('error', rejectRun)
    child.on('exit', code => code === 0 ? resolveRun() : rejectRun(new Error(`HBuilderX exited with ${code}`)))
  })
}

let staged = false
let stagedDirectory = false
let selectorChanged = false
let mpApiChanged = false
try {
  if (mode === 'full') {
    const wasmDirectory = dirname(wasmTarget)
    stagedDirectory = !existsSync(wasmDirectory)
    if (stagedDirectory) mkdirSync(wasmDirectory, { recursive: true })
    copyFileSync(wasmSource, wasmTarget)
    staged = true
    writeFileSync(selectorPath, original.replace(basicSelection, fullSelection))
    selectorChanged = true
    copyFileSync(mpFullApiPath, mpApiPath)
    mpApiChanged = true
  }
  await publish()
  const hasWasm = existsSync(resolve(buildRoot, 'uni_modules/uni-highlight/static/_onig.wasm'))
  const hasOnigRuntime = existsSync(resolve(buildRoot, 'uni_modules/uni-highlight/utssdk/mp-weixin/onig/main.js'))
  const hasTextMate = existsSync(resolve(buildRoot, 'uni_modules/uni-ai-x/sdk/parseCode-textmate.js'))
  if (hasWasm !== (mode === 'full') || hasOnigRuntime !== (mode === 'full') || hasTextMate !== (mode === 'full')) {
    throw new Error(`Unexpected ${mode} package contents: WASM=${hasWasm}, Oniguruma=${hasOnigRuntime}, TextMate=${hasTextMate}`)
  }
  console.log(`${mode} mini program: ${fileBytes(buildRoot)} bytes`)
} finally {
  if (mode === 'full') {
    if (mpApiChanged) {
      if (readFileSync(mpApiPath, 'utf8') === readFileSync(mpFullApiPath, 'utf8')) writeFileSync(mpApiPath, originalMpApi)
      else console.error('MP API changed during build; preserving the newer content')
    }
    if (selectorChanged) {
      const selected = original.replace(basicSelection, fullSelection)
      if (readFileSync(selectorPath, 'utf8') === selected) writeFileSync(selectorPath, original)
      else console.error('parseCode.uts changed during build; preserving the newer content')
    }
    if (staged && existsSync(wasmTarget)) {
      if (statSync(wasmTarget).size === statSync(wasmSource).size) unlinkSync(wasmTarget)
      else console.error('Staged WASM changed during build; preserving the newer file')
    }
    const wasmDirectory = dirname(wasmTarget)
    if (stagedDirectory && existsSync(wasmDirectory) && readdirSync(wasmDirectory).length === 0) rmdirSync(wasmDirectory)
  }
}
