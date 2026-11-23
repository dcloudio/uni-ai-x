import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadUts } from './uts-loader.mjs';

const config = () => loadUts('uni_modules/uni-ai-x/config.uts',
  ['llmModelMap', 'providerNameList', 'defaultLLM'], { reactive: value => value });

test('shipped configuration keeps gateway DeepSeek models but removes official credentials and provider', () => {
  const c = config();
  assert.equal(c.defaultLLM.provider, 'qiniu');
  assert.equal(c.llmModelMap.has('deepseek'), false);
  assert.ok(c.llmModelMap.get('qiniu').models.some(m => m.modelId === 'deepseek/deepseek-v4.1-flash'));
  assert.ok(c.llmModelMap.get('qiniu').models.some(m => m.modelId === 'deepseek/deepseek-v4-pro'));
  const text = readFileSync('uni_modules/uni-ai-x/config.uts', 'utf8');
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/);
  assert.match(text, /return '\*+'/);
});

test('disabled official config blocks token access before any network operation', async () => {
  const { llmModelMap } = config();
  const api = loadUts('uni_modules/uni-ai-x/sdk/deepseek-app-api.uts', ['supportsDeepSeekApps', 'deepSeekToken'], { llmModelMap });
  assert.equal(api.supportsDeepSeekApps('deepseek', 'deepseek-flash'), false);
  assert.equal(api.supportsDeepSeekApps('qiniu', 'deepseek/deepseek-v4.1-flash'), false);
  await assert.rejects(api.deepSeekToken());
});

test('automatic adapter installation registers only the gateway, even if an official example is supplied', () => {
  const registered = [];
  const llmModelMap = new Map([['deepseek', { baseURL: 'https://api.deepseek.com/chat/completions', models: [] }]]);
  const dependencies = { llmModelMap, CustomProviderAdapter: class {}, registerCustomProvider: name => registered.push(name), supportsDeepSeekApps: () => true };
  const adapter = loadUts('uni_modules/uni-ai-x/sdk/deepseek-app-adapter.uts', ['installDeepSeekApps'], dependencies);
  adapter.installDeepSeekApps();
  const agent = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['installAgentTools'], dependencies);
  agent.installAgentTools();
  assert.deepEqual(registered, ['qiniu']);
});
