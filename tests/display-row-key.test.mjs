import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue', import.meta.url), 'utf8');
function renderKey(platform = 'WEB') {
  const enabled = [true];
  const code = source.slice(source.indexOf('function partRenderKey('), source.indexOf('const isFirst ='))
    .split('\n').filter(line => {
      const directive = /^\s*\/\/\s*#(ifdef|ifndef|endif)\b\s*(.*)/.exec(line);
      if (!directive) return enabled.at(-1);
      if (directive[1] === 'endif') { enabled.pop(); return false; }
      const matches = directive[2].split('||').some(flag => flag.trim() === platform);
      enabled.push(enabled.at(-1) && (directive[1] === 'ifdef' ? matches : !matches));
      return false;
    }).join('\n');
  return new Function('parts', 'part', 'isUniAiMdPlatform = false', 'index = 0',
    stripTypeScriptTypes(code) + '\nreturn partRenderKey(part, index);');
}
const callKey = renderKey();
const key = (parts, part, native = false) => callKey({ value: parts }, part, native);
const part = (kind, id) => ({ key: id, block: { kind, key: id } });

test('single image and rich-text rows preserve display identity when rebound', () => {
  for (const kind of ['mermaid', 'rich']) {
    const a = part(kind, 'message-a:block-1');
    const b = part(kind, 'message-b:block-9');
    assert.equal(key([a], a), key([b], b));
  }
});

test('different display kinds do not share identity', () => {
  const image = part('mermaid', 'same-id');
  const rich = part('rich', 'same-id');
  assert.notEqual(key([image], image), key([rich], rich));
});

test('stateful, unknown and non-block parts retain their content keys', () => {
  for (const kind of ['code', 'math', 'table', 'future-kind']) {
    const a = part(kind, 'a');
    const b = part(kind, 'b');
    assert.equal(key([a], a), 'a');
    assert.equal(key([b], b), 'b');
  }
  const toolbar = { key: 'toolbar-a', kind: 'toolbar' };
  assert.equal(key([toolbar], toolbar), toolbar.key);
});

test('mixed rows retain distinct keys, including multiple blocks of the same kind', () => {
  const parts = [part('rich', 'a'), part('rich', 'b'), part('mermaid', 'c')];
  assert.deepEqual(parts.map(p => key(parts, p)), ['a', 'b', 'c']);
});

test('native Mermaid rendering retains source identity across recycled messages', () => {
  const a = part('mermaid', 'a');
  const b = part('mermaid', 'b');
  assert.equal(key([a], a, true), 'a');
  assert.equal(key([b], b, true), 'b');
});


test('Android recycled slots retain identity but remain distinct within mixed rows', () => {
  const androidKey = renderKey('APP-ANDROID');
  const a = part('html', 'first'), b = part('html', 'second');
  assert.equal(androidKey({ value: [a] }, a, true, 0), androidKey({ value: [b] }, b, true, 0));
  assert.notEqual(androidKey({ value: [a, b] }, a, true, 0), androidKey({ value: [a, b] }, b, true, 1));
});
