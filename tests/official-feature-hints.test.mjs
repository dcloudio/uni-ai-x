import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {loadUts} from './uts-loader.mjs';
const {supportsDeepSeekApps}=loadUts('uni_modules/uni-ai-x/sdk/deepseek-app-api.uts',['supportsDeepSeekApps'],{
 llmModelMap:new Map([['deepseek',{baseURL:'https://api.deepseek.com/chat/completions'}]]),
});
for (const kind of ['file','ocr','speech']) {
 test(`${kind}: gateway DeepSeek name cannot enable an official-only tool; hint explains the connection`,()=>{
  const name=kind==='speech'?'uni-ai-speech-output':'uni-ai-document-input';
  const source=readFileSync(`uni_modules/uni-ai-x/components/${name}.uvue`,'utf8').split('<script setup lang="uts">')[1].split('</script>')[0].replace(/^import[^\n]*\n/gm,'');
  const ai={llm:{provider:'qiniu',model:'deepseek/deepseek-v4.1-flash'}};
  const modals=[];
  const sdk=vm.runInNewContext('(function(){'+stripTypeScriptTypes(source)+'\nreturn {available,run:'+(kind==='speech'?'toggle':'chooseAction')+'};})()',{
   uniAi:ai,supportsDeepSeekApps,getLlmDisplayName:()=> 'DeepSeek Flash',tr:cn=>cn,
   computed:fn=>({get value(){return fn();}}),ref:value=>({value}),watch(){},onUnmounted(){},
   defineProps:()=>({ocr:kind==='ocr',messageId:'answer'}),withDefaults:props=>props,speechPlayback:{owner:''},
   uni:{showModal:options=>modals.push(options),chooseFile(){assert.fail('unavailable tool must not open picker');}},
  });
  assert.equal(sdk.available.value,false);sdk.run();
  assert.match(modals[0].content,/Uni AI 网关 · DeepSeek Flash/);
  assert.match(modals[0].content,/DeepSeek 官方 · DeepSeek Flash/);
  assert.equal(modals[0].cancelText,'暂不切换');
  assert.equal(modals[0].confirmText,'立即切换');
  modals[0].success({confirm:false,cancel:true});
  assert.equal(ai.llm.provider,'qiniu');
  modals[0].success({confirm:true,cancel:false});
  assert.equal(ai.llm.provider,'deepseek');
  assert.equal(ai.llm.model,'deepseek-flash');
  assert.equal(modals[0].title,'功能使用限制');
  ai.llm={provider:'deepseek',model:'deepseek-flash'};
  assert.equal(sdk.available.value,true);
 });
}
