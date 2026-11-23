import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function configWithGateway() {
  const config = loadUts('uni_modules/uni-ai-x/config.uts', ['llmModelMap', 'providerNameList', 'defaultLLM', 'registerOptionalProvider'], { reactive: value => value });
  const install = () => loadUts('uni_modules/uni-ai-x/sdk/install-qiniu.uts', [], { registerOptionalProvider: config.registerOptionalProvider });
  return { config, install };
}

test('default gateway retains the seven-model catalogue without enabling official direct access', () => {
  const { config, install } = configWithGateway();
  assert.equal(config.llmModelMap.has('deepseek'), false);
  assert.equal(config.defaultLLM.provider, 'qiniu');
  const initialDefault = { ...config.defaultLLM };
  install();
  assert.deepEqual(Array.from(config.llmModelMap.get('qiniu').models, m => m.modelId), [
    'deepseek/deepseek-v4.1-flash', 'deepseek/deepseek-v4-pro',
    'bytedance/doubao-seed-2-1-pro', 'bytedance/doubao-seed-2-1-turbo',
    'z-ai/glm-5.3', 'z-ai/glm-5.3-flash', 'minimax/minimax-m2.7',
  ]);
  assert.equal(config.llmModelMap.has('deepseek'), false);
  assert.deepEqual({ ...config.defaultLLM }, initialDefault);
  install();
  assert.equal(config.providerNameList.filter(p => p === 'qiniu').length, 1);
});

test('optional gateway installation preserves an existing custom gateway configuration', () => {
  const { config, install } = configWithGateway();
  const custom = { models: [{ modelId: 'custom-model' }] };
  config.llmModelMap.set('qiniu', custom);
  install();
  assert.equal(config.llmModelMap.get('qiniu'), custom);
});
