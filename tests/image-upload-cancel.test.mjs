import assert from 'node:assert/strict';
import test from 'node:test';
import {loadUts} from './uts-loader.mjs';
for (const cancelled of [true,false]) {
 test(cancelled ? 'cancelling image selection produces no error log or failure toast' : 'real image upload failure remains visible', async () => {
  const errors=[],toasts=[];
  const {uploadDraftImages}=loadUts('uni_modules/uni-ai-x/sdk/image-upload.uts',['uploadDraftImages'],{
   uniAi:{imgList:[]},getModelCapabilitySummary:()=>({hasImageModel:true}),
   uniCloud:{chooseAndUploadFile:()=>Promise.reject({errMsg:cancelled?'chooseAndUploadFile:fail cancel':'chooseAndUploadFile:fail network'})},
   uni:{showToast:value=>toasts.push(value)},console:{error:(...args)=>errors.push(args)},
  });
  uploadDraftImages({image:true},'album');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(errors.length,cancelled?0:1);
  assert.equal(toasts.length,cancelled?0:1);
 });
}
