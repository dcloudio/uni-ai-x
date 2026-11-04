import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const mode = process.argv[2]
if (mode != null && mode !== 'basic' && mode !== 'full') {
  console.error('Usage: node scripts/select-mp-weixin-mode.mjs [basic|full]')
  process.exit(2)
}

const paths = {
  selector: resolve(root, 'uni_modules/uni-ai-x/sdk/parseCode.uts'),
  api: resolve(root, 'uni_modules/uni-highlight/utssdk/mp-weixin/index.uts'),
  pages: resolve(root, 'pages.json'),
  wasm: resolve(root, 'uni_modules/uni-highlight/static/_onig.wasm'),
  bundle: resolve(root, 'uni_modules/uni-ai-x/sdk/grammar-bundle.js')
}
const fullApiPath = resolve(root, 'uni_modules/uni-highlight/utssdk/mp-weixin/index-textmate.uts')
const fullPagesPath = resolve(root, 'scripts/pages-mp-weixin-full.json')
const wasmSourcePath = resolve(root, 'static/web/uni-highlight/_onig.wasm')
const archivePath = resolve(root, 'scripts/grammars.zip')
const markerPath = resolve(root, 'scripts/.mp-weixin-mode.json')
const basicSelection = "export * from './parseCode-basic.uts'\n// export * from './parseCode-textmate.uts'"
const fullSelection = "// export * from './parseCode-basic.uts'\nexport * from './parseCode-textmate.uts'"
const readText = path => readFileSync(path, 'utf8')
const hash = value => createHash('sha256').update(value).digest('hex')

function currentBasic() {
  const selector = readText(paths.selector)
  if (!selector.includes(basicSelection)) throw new Error('Highlighter entry is not in the default basic mode')
  if (existsSync(paths.wasm) || existsSync(paths.bundle)) throw new Error('Full-mode resources exist without a mode marker')
  if (readText(paths.api) === readText(fullApiPath) || readText(paths.pages) === readText(fullPagesPath)) {
    throw new Error('Full-mode source exists without a mode marker')
  }
  return { selector, api: readText(paths.api), pages: readText(paths.pages) }
}

function stagedFiles(original) {
  const archive = readFileSync(archivePath)
  const bundleId = hash(archive).slice(0, 12)
  return {
    selector: original.selector.replace(basicSelection, fullSelection),
    api: readText(fullApiPath),
    pages: readText(fullPagesPath),
    wasm: readFileSync(wasmSourcePath),
    bundle: `export const grammarBundleId = '${bundleId}'\nexport default '${archive.toString('base64')}'\n`
  }
}

function readMarker() {
  if (!existsSync(markerPath)) return null
  const marker = JSON.parse(readText(markerPath))
  if (marker.version !== 1 || marker.mode !== 'full' || marker.original == null || marker.staged == null) {
    throw new Error(`Invalid mode marker: ${markerPath}`)
  }
  return marker
}

function verifyFull(marker) {
  for (const key of ['selector', 'api', 'pages', 'wasm', 'bundle']) {
    if (!existsSync(paths[key]) || hash(readFileSync(paths[key])) !== marker.staged[key]) {
      throw new Error(`Full mode is incomplete or ${paths[key]} changed; select basic before switching again`)
    }
  }
}

function restoreBasic(marker) {
  for (const key of ['selector', 'api', 'pages']) {
    const current = readText(paths[key])
    if (current !== marker.original[key] && hash(current) !== marker.staged[key]) {
      throw new Error(`${paths[key]} changed after selecting full mode; preserving your edits`)
    }
  }
  for (const key of ['wasm', 'bundle']) {
    if (existsSync(paths[key]) && hash(readFileSync(paths[key])) !== marker.staged[key]) {
      throw new Error(`${paths[key]} changed after selecting full mode; preserving your edits`)
    }
  }
  for (const key of ['selector', 'api', 'pages']) writeFileSync(paths[key], marker.original[key])
  for (const key of ['wasm', 'bundle']) if (existsSync(paths[key])) unlinkSync(paths[key])
  const wasmDirectory = dirname(paths.wasm)
  if (marker.createdWasmDirectory && existsSync(wasmDirectory) && readdirSync(wasmDirectory).length === 0) {
    rmdirSync(wasmDirectory)
  }
  unlinkSync(markerPath)
}

const marker = readMarker()
if (mode == null) {
  if (marker == null) currentBasic()
  else verifyFull(marker)
  console.log(`Selected mini-program mode: ${marker == null ? 'basic' : 'full'}`)
} else if (mode === 'basic') {
  if (marker == null) currentBasic()
  else restoreBasic(marker)
  console.log('Selected basic mode. Run or publish the mini program in HBuilderX.')
} else if (marker != null) {
  verifyFull(marker)
  console.log('Full mode is already selected. Run or publish the mini program in HBuilderX.')
} else {
  const original = currentBasic()
  const staged = stagedFiles(original)
  const createdWasmDirectory = !existsSync(dirname(paths.wasm))
  const nextMarker = {
    version: 1,
    mode: 'full',
    original,
    staged: Object.fromEntries(Object.entries(staged).map(([key, value]) => [key, hash(value)])),
    createdWasmDirectory
  }
  writeFileSync(markerPath, JSON.stringify(nextMarker))
  try {
    if (createdWasmDirectory) mkdirSync(dirname(paths.wasm), { recursive: true })
    for (const key of ['selector', 'api', 'pages', 'wasm', 'bundle']) writeFileSync(paths[key], staged[key])
  } catch (error) {
    restoreBasic(nextMarker)
    throw error
  }
  console.log('Selected full TextMate mode. Run or publish the mini program in HBuilderX; select basic after uploading.')
}
