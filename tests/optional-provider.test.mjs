import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function baseConfig() {
  return loadUts('uni_modules/uni-ai-x/config.uts',
    ['llmModelMap', 'providerNameList', 'defaultLLM', 'registerOptionalProvider'],
    { reactive: value => value });
}

test('optional assistant registers first without duplicating the provider on repeated install', () => {
  const config = baseConfig();
  assert.equal(config.defaultLLM.provider, 'qiniu');
  assert.equal(config.llmModelMap.has('Uni小助手'), false);

  const adapters = new Map();
  const plugin = loadUts('uni_modules/uni-ai-x-uni-assistant/install.uts',
    ['installUniAssistant'], {
      registerOptionalProvider: config.registerOptionalProvider,
      registerCustomProvider: (name, adapter) => adapters.set(name, adapter),
      CustomProviderAdapter: class {},
    });

  assert.equal(config.providerNameList[0], 'Uni小助手');
  assert.equal(config.defaultLLM.provider, 'Uni小助手');
  assert.equal(config.defaultLLM.model, 'doc-search');
  assert.equal(config.llmModelMap.get('Uni小助手').models[0].name, 'Uni 小助手');
  assert.equal(adapters.get('Uni小助手').supportsTitleUpdate, false);

  plugin.installUniAssistant();
  assert.equal(config.providerNameList.filter(name => name === 'Uni小助手').length, 1);
});
