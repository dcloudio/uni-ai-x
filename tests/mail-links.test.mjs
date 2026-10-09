import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function load(platform, overrides = {}) {
  const lines = readFileSync(new URL('../uni_modules/uni-ai-x/sdk/open-web-link.uts', import.meta.url), 'utf8').split('\n');
  const enabled = [true];
  const output = [];
  for (const line of lines) {
    const condition = /\/\/ #ifdef (.*)/.exec(line);
    if (condition) { enabled.push(enabled.at(-1) && platform.includes(condition[1])); continue; }
    if (line.includes('// #endif')) { enabled.pop(); continue; }
    if (enabled.at(-1) && !line.startsWith('import ')) output.push(line.replace(/^export /, ''));
  }
  const calls = [];
  const context = vm.createContext({ window: { location: {}, open: () => ({}) },
    uni: { showToast: value => calls.push(['toast', value]), showModal: value => calls.push(['modal', value]),
      navigateTo: value => calls.push(['navigate', value]), setClipboardData: value => calls.push(['copy', value]) },
    openSchema: value => calls.push(['schema', value]), canOpenURL: () => true, ...overrides });
  vm.runInContext(stripTypeScriptTypes(output.join('\n')), context);
  return { context, calls };
}

test('web mail links keep recipient and encoded subject/body and bypass web preview', () => {
  const { context, calls } = load(['WEB']);
  const mail = 'mailto:example@email.com?subject=Hello%20world&body=Line1%0ALine2';
  context.openWebLink(mail);
  assert.equal(context.window.location.href, mail);
  assert.deepEqual(calls, []);
});

test('app dispatches mail to system and offers copying on a launch failure', () => {
  const { context, calls } = load(['APP']);
  context.openWebLink('MAILTO:example@email.com');
  assert.deepEqual(calls[0], ['schema', 'mailto:example@email.com']);
  const failed = load(['APP'], { openSchema() { throw new Error('No handler'); } });
  failed.context.openWebLink('mailto:example@email.com?subject=test');
  assert.equal(failed.calls[0][0], 'modal');
  failed.calls[0][1].success({ confirm: true });
  assert.equal(failed.calls[1][1].data, 'example@email.com');
});

test('unsupported schemes remain rejected and HTTP links retain web preview behavior', () => {
  const { context, calls } = load(['APP']);
  context.openWebLink('javascript:alert(1)');
  assert.equal(calls[0][0], 'toast');
  context.openWebLink('https://example.com/?a=1&b=2');
  assert.equal(calls[1][0], 'navigate');
});
