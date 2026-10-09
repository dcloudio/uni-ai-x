import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue', import.meta.url), 'utf8');
const expression = source.match(/<template v-for="part in parts" :key="([^"]+)"/)[1];
const key = new Function('parts', 'part', 'isLibmarkPlatform = false', `return ${expression}`);
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
