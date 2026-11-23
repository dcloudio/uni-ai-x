import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function capabilities(flags = ['APP', 'APP-ANDROID'], browser = {}) {
  const llmModelMap = new Map([
    ['qiniu', { models: [{ modelId: 'vision', image: true, thinking: true, toolCall: true }, { modelId: 'plain' }], getToken: async () => 'temporary', webSearchURL: '/search' }],
    ['gateway', { models: [{ modelId: 'deepseek', thinking: true, image: true }] }],
    ['openClaw', { models: [{ modelId: 'default', thinking: true }] }],
  ]);
  return loadUts('uni_modules/uni-ai-x/sdk/model-capabilities.uts', ['getModelCapabilities'], {
    llmModelMap, supportsDeepSeekApps: () => false, ...browser,
  }, flags).getModelCapabilities;
}

test('gateway model capabilities remain usable without exposing unsupported official app features', () => {
  const get = capabilities();
  const gateway = get('gateway', 'deepseek');
  assert.equal(gateway.thinking, true);
  assert.equal(gateway.images, true);
  for (const key of ['speechOutput', 'documents', 'speechInput', 'webSearch']) assert.equal(gateway[key], false);
  assert.equal(get('openClaw', 'default').thinking, false);
  assert.ok(Object.values(get('gateway', 'removed-model')).every(value => value === false));
});

test('Qiniu retains image understanding, speech input and configured search independently of the current model', () => {
  const get = capabilities();
  assert.equal(get('qiniu', 'vision').images, true);
  assert.equal(get('qiniu', 'vision').thinking, true);
  const plain = get('qiniu', 'plain');
  assert.equal(plain.images, false);
  assert.equal(plain.thinking, false);
  assert.equal(plain.webSearch, true);
  assert.equal(plain.speechInput, true);
  assert.equal(plain.documents, false);
  assert.equal(plain.speechOutput, false);
});

test('Web hides speech input when browser recording or decoding is unavailable', () => {
  const get = capabilities(['WEB']);
  assert.equal(get('qiniu', 'vision').speechInput, false);
  const supported = capabilities(['WEB'], { MediaRecorder: class {}, AudioContext: class {}, navigator: { mediaDevices: {} } });
  assert.equal(supported('qiniu', 'vision').speechInput, true);
});
