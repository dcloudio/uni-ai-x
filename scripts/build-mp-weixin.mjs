import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// basic is the default for all mini programs. For a WeChat full build, use
// `node scripts/build-mp-weixin.mjs full`; this script stages the matching
// TextMate API, grammar bundle, pages, and WASM, then restores basic sources.
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
const pagesPath = resolve(root, 'pages.json')
const fullPagesPath = resolve(root, 'scripts/pages-mp-weixin-full.json')
const grammarArchivePath = resolve(root, 'scripts/grammars.zip')
const grammarBundlePath = resolve(root, 'uni_modules/uni-ai-x/sdk/grammar-bundle.js')
const buildRoot = resolve(root, 'unpackage/dist/build/mp-weixin')
const basicSelection = "export * from './parseCode-basic.uts'\n// export * from './parseCode-textmate.uts'"
const fullSelection = "// export * from './parseCode-basic.uts'\nexport * from './parseCode-textmate.uts'"
const original = readFileSync(selectorPath, 'utf8')
const originalMpApi = readFileSync(mpApiPath, 'utf8')
const originalPages = readFileSync(pagesPath, 'utf8')
if (!original.includes(basicSelection)) throw new Error('Expected the default basic highlight selection in parseCode.uts')
if (existsSync(wasmTarget)) throw new Error(`Unexpected staged WASM: ${wasmTarget}`)
if (!existsSync(wasmSource)) throw new Error(`Missing full-mode WASM: ${wasmSource}`)
if (mode === 'full' && existsSync(grammarBundlePath)) throw new Error(`Unexpected staged grammar bundle: ${grammarBundlePath}`)
if (mode === 'full' && !existsSync(grammarArchivePath)) throw new Error(`Missing grammar archive: ${grammarArchivePath}`)

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
let pagesChanged = false
let grammarBundleStaged = false
let grammarBundleSource = ''
try {
  if (mode === 'full') {
    const wasmDirectory = dirname(wasmTarget)
    stagedDirectory = !existsSync(wasmDirectory)
    if (stagedDirectory) mkdirSync(wasmDirectory, { recursive: true })
    copyFileSync(wasmSource, wasmTarget)
    staged = true
    grammarBundleSource = `export default '${readFileSync(grammarArchivePath).toString('base64')}'\n`
    writeFileSync(grammarBundlePath, grammarBundleSource)
    grammarBundleStaged = true
    writeFileSync(selectorPath, original.replace(basicSelection, fullSelection))
    selectorChanged = true
    copyFileSync(mpFullApiPath, mpApiPath)
    mpApiChanged = true
    copyFileSync(fullPagesPath, pagesPath)
    pagesChanged = true
  }
  await publish()
  const hasWasm = existsSync(resolve(buildRoot, 'uni_modules/uni-highlight/static/_onig.wasm'))
  const hasOnigRuntime = existsSync(resolve(buildRoot, 'uni_modules/uni-highlight/utssdk/mp-weixin/onig/main.js'))
  const hasTextMate = existsSync(resolve(buildRoot, 'uni_modules/uni-ai-x/sdk/parseCode-textmate.js'))
  const hasGrammarBundle = existsSync(resolve(buildRoot, 'uni_modules/uni-ai-x/sdk/grammar-bundle.js'))
  if (hasWasm !== (mode === 'full') || hasOnigRuntime !== (mode === 'full') || hasTextMate !== (mode === 'full') || hasGrammarBundle !== (mode === 'full')) {
    throw new Error(`Unexpected ${mode} package contents: WASM=${hasWasm}, Oniguruma=${hasOnigRuntime}, TextMate=${hasTextMate}, grammars=${hasGrammarBundle}`)
  }
  const app = JSON.parse(readFileSync(resolve(buildRoot, 'app.json'), 'utf8'))
  const expectedPage = mode === 'full' ? 'pages/launch/index' : 'uni_modules/uni-ai-x/pages/index/index'
  if (app.pages[0] !== expectedPage) throw new Error(`Unexpected ${mode} entry page: ${app.pages[0]}`)
  if (mode === 'full' && !app.subPackages.some(pkg => pkg.root === 'uni_modules/uni-ai-x')) throw new Error('Missing full chat subpackage')
  const subPackages = app.subPackages.map(pkg => ({ root: pkg.root, bytes: fileBytes(resolve(buildRoot, pkg.root)) }))
  const totalBytes = fileBytes(buildRoot)
  const mainBytes = totalBytes - subPackages.reduce((sum, pkg) => sum + pkg.bytes, 0)
  console.log(`${mode} mini program: total=${totalBytes}, main=${mainBytes}, subpackages=${JSON.stringify(subPackages)} bytes`)
  if (mode === 'full' && [mainBytes, ...subPackages.map(pkg => pkg.bytes)].some(bytes => bytes > 2 * 1024 * 1024)) {
    throw new Error('Full mini program exceeds the 2 MiB per-package target')
  }
} finally {
  if (mode === 'full') {
    if (pagesChanged) {
      if (readFileSync(pagesPath, 'utf8') === readFileSync(fullPagesPath, 'utf8')) writeFileSync(pagesPath, originalPages)
      else console.error('pages.json changed during build; preserving the newer content')
    }
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
    if (grammarBundleStaged && existsSync(grammarBundlePath)) {
      if (readFileSync(grammarBundlePath, 'utf8') === grammarBundleSource) unlinkSync(grammarBundlePath)
      else console.error('Staged grammar bundle changed during build; preserving the newer file')
    }
    const wasmDirectory = dirname(wasmTarget)
    if (stagedDirectory && existsSync(wasmDirectory) && readdirSync(wasmDirectory).length === 0) rmdirSync(wasmDirectory)
  }
}
