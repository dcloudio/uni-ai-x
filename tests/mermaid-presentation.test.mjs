import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function setup() {
  const calls = [];
  let saves = 0;
  let theme = 'light';
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/sdk/mermaid-presentation.uts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({
    ref: value => ({ value }),
    uni: { getWindowInfo: () => ({ windowWidth: 412 }) },
    renderMermaidSvgForTheme: (text, theme, callback) => calls.push({ text, theme, callback }),
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  const prepare = msg => context.prepareMermaidPresentation(msg, theme, () => theme, () => saves++);
  return { calls, prepare, saves: () => saves, theme: value => { theme = value; } };
}

const block = (text = 'graph TD; A-->B', isComplete = true) => ({ key: 'code-0', kind: 'mermaid', text, isComplete });
const message = blocks => ({ _id: 'message', markdownBlocks: JSON.stringify(blocks) });
const finish = (call, imageSource = '/prepared.svg') => call.callback({ imageSource });

test('open blocks do not render; pending requests are deduplicated; prepared blocks do not render again', () => {
  const api = setup();
  const msg = message([block('graph TD', false)]);
  api.prepare(msg);
  assert.equal(api.calls.length, 0);
  msg.markdownBlocks = JSON.stringify([block()]);
  api.prepare(msg);
  api.prepare(msg);
  assert.equal(api.calls.length, 1);
  finish(api.calls[0]);
  api.prepare(msg);
  assert.equal(api.calls.length, 1);
  assert.equal(api.saves(), 1);
});

test('results merge into the latest snapshot without discarding later blocks', () => {
  const api = setup();
  const msg = message([block()]);
  api.prepare(msg);
  msg.markdownBlocks = JSON.stringify([block(), { key: 'text-1', kind: 'text', text: 'new' }]);
  finish(api.calls[0]);
  const result = JSON.parse(msg.markdownBlocks);
  assert.equal(result.length, 2);
  assert.equal(result[0].mermaidImageSource, '/prepared.svg');
});

test('replaced source, reset messages and obsolete themes reject old callbacks', () => {
  for (const change of ['source', 'reset', 'theme']) {
    const api = setup();
    const msg = message([block()]);
    api.prepare(msg);
    if (change === 'source') msg.markdownBlocks = JSON.stringify([block('graph TD; X-->Y')]);
    if (change === 'reset') msg.markdownBlocks = '';
    if (change === 'theme') api.theme('dark');
    finish(api.calls[0]);
    assert.equal(api.saves(), 0);
  }
});

test('a newer pending request wins; failed rendering leaves source available for retry', () => {
  const api = setup();
  const msg = message([block()]);
  api.prepare(msg);
  api.theme('dark');
  api.prepare(msg);
  finish(api.calls[0]);
  assert.equal(api.saves(), 0);
  finish(api.calls[1], '');
  api.prepare(msg);
  assert.equal(api.calls.length, 3);
  finish(api.calls[2]);
  assert.equal(JSON.parse(msg.markdownBlocks)[0].mermaidRenderTheme, 'dark');
});

test('presentation component has no rendering, parsing, watchers or mount measurements', () => {
  const source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-msg-mermaid.uvue', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(watch|computed|onMounted|getWindowInfo|renderMermaidSvgForTheme|JSON\.parse)\s*\(/);
});
