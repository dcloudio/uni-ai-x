import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-msg-mermaid.uvue', import.meta.url), 'utf8');
function setup() {
  const props = { identity: 'message-a:code-0', src: '/a.svg', codeText: 'graph TD; A-->B' };
  const calls = [];
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '');
  const context = vm.createContext({
    defineProps: () => props, withDefaults: value => value, ref: value => ({ value }),
    window: { navigator: { userAgent: 'Android' } },
    uni: { previewImage: options => calls.push(['preview', options.urls[0]]), setClipboardData: options => calls.push(['copy', options.data]) },
    utils: { showCopySuccessToast() {}, showCopyFailureToast() {} },
  });
  vm.runInContext(stripTypeScriptTypes(script), context);
  return { props, calls, context };
}

test('mounting only binds data; copying and previewing read the current recycled row on click', () => {
  const api = setup();
  assert.equal(api.calls.length, 0);
  api.props.src = '/b.svg';
  api.props.codeText = 'graph TD; X-->Y';
  api.context.copyCode();
  api.context.previewMermaidImage();
  assert.deepEqual(api.calls, [['copy', 'graph TD; X-->Y'], ['preview', '/b.svg']]);
  api.props.src = '';
  api.context.previewMermaidImage();
  assert.equal(api.calls.length, 2);
});

test('source selection is scoped to message/block identity and source panel is created conditionally', () => {
  const api = setup();
  vm.runInContext('sourceSelection.value = props.identity', api.context);
  assert.equal(vm.runInContext('sourceSelection.value == props.identity', api.context), true);
  api.props.identity = 'message-b:code-0';
  assert.equal(vm.runInContext('sourceSelection.value == props.identity', api.context), false);
  assert.match(source, /<view v-else class="uni-mermaid-msg-code-source"/);
  assert.match(source, /v-if="sourceSelection != props.identity && props.src.length > 0"/);
  assert.doesNotMatch(source, /\b(watch|computed|onMounted|getWindowInfo|JSON\.parse|renderMermaidSvgForTheme)\s*\(/);
});
