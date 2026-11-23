import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function mountMessage(attached = true) {
  const hooks = {}, ticks = [];
  let observed = 0, measured = 0, disconnected = 0, callback;
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-user-msg.uvue', import.meta.url), 'utf8')
    .split('<script lang="uts" setup>')[1].split('</script>')[0]
    .replace(/^\s*import .*$/gm, '')
    .replace(/\/\/ #ifdef WEB[\s\S]*?\/\/ #endif/g, '');
  vm.runInNewContext(stripTypeScriptTypes(source), {
    defineProps: () => ({ msg: { body: 'weather', file_list: [] } }),
    ref: value => ({ value: value === null ? { getBoundingClientRect() { measured++; return { height: 300 }; } } : value }), computed: fn => ({ value: fn() }), watch() {},
    onMounted: fn => { hooks.mount = fn; },
    onBeforeUnmount: fn => { hooks.dispose = fn; },
    onUnmounted: fn => { hooks.unmount = fn; },
    nextTick: fn => { ticks.push(fn); },
    UniResizeObserver: class {
      constructor(fn) { callback = fn; }
      observe() { observed++; }
      disconnect() { disconnected++; }
    },
    uni: { getElementById: () => attached ? { getBoundingClientRect() { measured++; return { height: 300 }; } } : null },
  });
  // The template ref is populated by the renderer before mounted callbacks.
  return { hooks, ticks, stats: () => ({ observed, measured, disconnected }), callback: () => callback?.() };
}

test('discarded user message does not start a deferred observer', () => {
  const component = mountMessage();
  component.hooks.mount();
  component.hooks.dispose?.();
  component.hooks.unmount?.();
  for (const tick of component.ticks) tick();
  assert.equal(component.stats().observed, 0);
  assert.equal(component.stats().measured, 0);
});

test('late resize notification after disposal does not measure detached text', () => {
  const component = mountMessage();
  component.hooks.mount();
  for (const tick of component.ticks) tick();
  assert.equal(component.stats().observed, 1);
  const before = component.stats().measured;
  component.hooks.dispose?.();
  component.hooks.unmount?.();
  component.callback();
  assert.equal(component.stats().measured, before);
  assert.equal(component.stats().disconnected, 1);
});

test('recycled native row with a stale template ref is not observed', () => {
  const component = mountMessage(false);
  component.hooks.mount();
  for (const tick of component.ticks) tick();
  assert.equal(component.stats().observed, 0);
  assert.equal(component.stats().measured, 0);
});
