import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function fixture() {
  let resize, mutation
  const items = [], registry = [], calls = []
  const context = {
    ResizeObserver: class {
      constructor(callback) { resize = callback }
      observe(el) { calls.push(['observe', el]) }
      unobserve(el) { calls.push(['unobserve', el]) }
      disconnect() { calls.push(['resize-disconnect']) }
    },
    MutationObserver: class {
      constructor(callback) { mutation = callback }
      observe() {}
      disconnect() { calls.push(['mutation-disconnect']) }
    },
    getComputedStyle: el => ({ marginTop: el.marginTop ?? '0px', marginBottom: el.marginBottom ?? '0px' }),
  }
  const source = fs.readFileSync(new URL('../uni_modules/uni-ai-x/sdk/web-list-view-size.js', import.meta.url), 'utf8')
  const install = vm.runInNewContext(source.replace('export function', 'function') + '\nobserveWebListItemSizes', context)
  const root = { querySelectorAll: () => items, contains: el => items.includes(el) }
  function add(height = 26) {
    const status = { type: 'ListItem', visible: { value: true }, cachedSize: 26, cachedSizeUpdated: true }
    registry.push(status)
    const el = {
      isConnected: true, height, nodeType: 1,
      matches: selector => selector === 'uni-list-item', querySelector: () => null,
      getBoundingClientRect() { return { height: this.height } },
      __vueParentComponent: {
        exposed: { __listViewChildStatus: status },
        provides: {
          __listViewRegisterItem(s) { assert.ok(!registry.includes(s)); registry.push(s); calls.push(['register', s]) },
          __listViewUnregisterItem(s) { assert.ok(registry.includes(s)); registry.splice(registry.indexOf(s), 1); calls.push(['unregister', s]) },
        },
      },
    }
    items.push(el)
    return { el, status }
  }
  return { add, items, calls, registry, install: () => install(root), resize: el => resize([{ target: el }]), mutation: records => mutation(records) }
}

test('updates growing and shrinking rows including margins without duplicate registration', () => {
  const f = fixture(), { el, status } = f.add()
  const stop = f.install()
  const initial = f.calls.length
  f.resize(el)
  assert.equal(f.calls.length, initial)
  el.height = 8000; el.marginTop = '2px'; el.marginBottom = '3px'
  f.resize(el)
  assert.equal(status.cachedSize, 8005)
  el.height = 100
  f.resize(el)
  assert.equal(status.cachedSize, 105)
  assert.equal(f.registry.length, 1)
  assert.equal(status.visible.value, true)
  stop()
})

test('discovers recycled rows and session replacements, unobserves removed nodes', () => {
  const f = fixture(), old = f.add()
  const stop = f.install()
  f.items.splice(0)
  const next = f.add(120)
  f.mutation([{ addedNodes: [next.el], removedNodes: [old.el] }])
  assert.ok(f.calls.some(([name, el]) => name === 'unobserve' && el === old.el))
  f.resize(next.el)
  assert.equal(next.status.cachedSize, 120)
  old.el.height = 9000
  f.resize(old.el)
  assert.equal(old.status.cachedSize, 26)
  stop()
})

test('never reactivates recycled rows or updates an unsupported runtime contract', () => {
  const f = fixture(), hidden = f.add(500), unsupported = f.add(700)
  hidden.status.visible.value = false
  delete unsupported.el.__vueParentComponent.provides.__listViewUnregisterItem
  const stop = f.install()
  f.resize(hidden.el); f.resize(unsupported.el)
  assert.equal(hidden.status.cachedSize, 26)
  assert.equal(hidden.status.visible.value, false)
  assert.equal(unsupported.status.cachedSize, 26)
  assert.equal(f.registry.length, 2)
  stop()
})

test('unmount disconnects both observers and ignores already queued callbacks', () => {
  const f = fixture(), { el, status } = f.add()
  const stop = f.install()
  stop()
  const count = f.calls.length
  el.height = 500
  f.resize(el)
  f.mutation([{ addedNodes: [el], removedNodes: [] }])
  assert.equal(status.cachedSize, 26)
  assert.equal(f.calls.length, count)
  assert.ok(f.calls.some(([name]) => name === 'resize-disconnect'))
  assert.ok(f.calls.some(([name]) => name === 'mutation-disconnect'))
})
