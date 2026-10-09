const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const pluginRoot = process.env.HBUILDERX_PLUGINS || ['/Applications/HBuilderX-Dev.app', '/Applications/HBuilderX-Alpha.app', '/Applications/HBuilderX.app']
  .map(app => path.join(app, 'Contents/HBuilderX/plugins')).find(root => fs.existsSync(root));
if (!pluginRoot) throw new Error('Set HBUILDERX_PLUGINS to the HBuilderX plugins directory.');
const ts = require(path.join(pluginRoot, 'uniapp-uts-v1/node_modules/@dcloudio/uni-uts-v1/lib/typescript/lib/typescript.js'));
const vue = require(path.join(pluginRoot, 'uniapp-cli-vite/node_modules/@vue/compiler-sfc/dist/compiler-sfc.cjs.js'));
const { preprocess } = require(path.join(pluginRoot, 'uniapp-cli-vite/node_modules/@dcloudio/uni-cli-shared/lib/preprocess'));
const files = execFileSync('rg', ['--files','uni_modules/uni-ai-x','uni_modules/uni-ai-worker','uni_modules/uni-ai-worker-runtime','uni_modules/libmark','workers','demo/markdown','uni_modules/uni-highlight/utssdk']).toString().trim().split('\n').filter(f=>/\.(uts|uvue|ets)$/.test(f));
let errors=0;
for (const platform of ['APP-ANDROID','APP-HARMONY','APP-IOS','WEB','MP-WEIXIN']) for (const file of files) {
  const source=fs.readFileSync(file,'utf8');
  let code=source;
  if(file.endsWith('.uvue')) {
    const parsed=vue.parse(source,{filename:file});
    for(const error of parsed.errors){console.log(file,String(error));errors++;}
    code=(parsed.descriptor.script?.content||'')+(parsed.descriptor.scriptSetup?.content||'');
  }
  const flags = { [platform]: true, APP: platform.startsWith('APP-'), WEB: platform === 'WEB', H5: platform === 'WEB', MP: platform.startsWith('MP-'), 'UNI-APP-X': true, VUE3: true, uniVersion: 5.32 };
  code=preprocess(code,flags,{type:'js'});
  const ast=ts.createSourceFile(file+'.ts',code,ts.ScriptTarget.Latest,true);
  for(const error of ast.parseDiagnostics) {
    const pos=ast.getLineAndCharacterOfPosition(error.start);
    console.log(platform,file,`${pos.line+1}:${pos.character+1}`,ts.flattenDiagnosticMessageText(error.messageText,' '));errors++;
  }
}
console.log(JSON.stringify({files:files.length,platforms:5,errors}));
process.exitCode=errors?1:0;
