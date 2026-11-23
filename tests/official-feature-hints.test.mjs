import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { loadUts } from './uts-loader.mjs';

for (const kind of ['file', 'ocr', 'speech']) {
  test(`${kind}: unavailable official feature explains the server proxy without switching the gateway model`, () => {
    const name = kind === 'speech' ? 'uni-ai-speech-output' : 'uni-ai-document-input';
    const source = readFileSync(`uni_modules/uni-ai-x/components/${name}.uvue`, 'utf8')
      .split('<script setup lang="uts">')[1].split('</script>')[0].replace(/^import[^\n]*\n/gm, '');
    const ai = { llm: { provider: 'qiniu', model: 'deepseek/deepseek-v4.1-flash' } };
    const toasts = [];
    const switching = loadUts('uni_modules/uni-ai-x/sdk/official-feature-switch.uts',
      ['requestOfficialFeatureSwitch', 'resolveOfficialFeatureSwitch', 'officialFeatureSwitch'], {
        reactive: value => value, tr: cn => cn,
        uni: { showToast: options => toasts.push(options) },
      });
    const sdk = vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) + '\nreturn {available,run:' + (kind === 'speech' ? 'toggle' : 'chooseAction') + '};})()', {
      uniAi: ai, supportsDeepSeekApps: () => false, ...switching, tr: cn => cn,
      computed: fn => ({ get value() { return fn(); } }), ref: value => ({ value }), watch() {}, onUnmounted() {},
      defineProps: () => ({ ocr: kind === 'ocr', messageId: 'answer' }),
      withDefaults: (props, defaults) => Object.assign({}, defaults, props), speechPlayback: { owner: '' },
      uni: { chooseFile() { assert.fail('disabled feature must not open a file picker'); } },
    });
    assert.equal(sdk.available.value, false);
    sdk.run();
    assert.match(toasts[0].title, /云端中转/);
    assert.equal(switching.officialFeatureSwitch.visible, false);
    switching.resolveOfficialFeatureSwitch(true);
    assert.equal(ai.llm.provider, 'qiniu');
    assert.equal(ai.llm.model, 'deepseek/deepseek-v4.1-flash');
  });
}
