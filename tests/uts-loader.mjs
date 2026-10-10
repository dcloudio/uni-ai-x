import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

export function loadUts(path, names, dependencies = {}, flags = ['APP', 'APP-ANDROID']) {
  const enabled = [true];
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
    .split('\n').filter(line => {
      const directive = /^\s*\/\/\s*#(ifdef|ifndef|endif)\b\s*(.*)/.exec(line);
      if (directive == null) return enabled.at(-1);
      if (directive[1] === 'endif') { enabled.pop(); return false; }
      const condition = directive[2].split('||').some(group => group.trim().split('&&').every(flag => flags.includes(flag.trim())));
      enabled.push(enabled.at(-1) && (directive[1] === 'ifdef' ? condition : !condition));
      return false;
    }).join('\n')
    .replace(/^import[\s\S]*?from [^\n]*\n/gm, '')
    .replace(/^export type \{[^\n]*\} from [^\n]*\n/gm, '')
    .replace(/^@UTSJS\.keepAlive\s*$/gm, '')
    .replace(/^export default .*$/gm, '').replace(/^export /gm, '');
  if (enabled.length !== 1) throw new Error('Unbalanced platform directives: ' + path);
  return vm.runInNewContext('(function(){' + stripTypeScriptTypes(source) + '\nreturn {' + names.join(',') + '};})()', dependencies);
}
