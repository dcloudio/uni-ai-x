import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../uni_modules/uni-ai-x/utssdk/runtime/web-worker-message.js', import.meta.url), 'utf8');
const { toWebWorkerMessage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Worker JSON boundary removes uncloneable proxies at every depth without changing protocol data', () => {
  const proxy = value => new Proxy(value, {});
  const payload = proxy({ action: 'append-markdown', requestVersion: 42, content: '# 中文 ✅\n', reasoningContent: '', nested: proxy({ items: [proxy({ value: null }), false, 0] }) });
  assert.throws(() => structuredClone(payload), { name: 'DataCloneError' });
  const wire = toWebWorkerMessage(payload);
  assert.deepEqual(structuredClone(wire), {
    action: 'append-markdown', requestVersion: 42, content: '# 中文 ✅\n', reasoningContent: '', nested: { items: [{ value: null }, false, 0] }
  });
  wire.nested.items[0].value = 'changed';
  assert.equal(payload.nested.items[0].value, null);
});

test('Worker JSON boundary preserves nested snapshot JSON and error messages verbatim', () => {
  for (const data of [{phase:'ready'}, {phase:'init-error',errMsg:'初始化失败'}, {phase:'snapshot',snapshotJson:JSON.stringify({isDone:true,msgBody:'```js\nconst x = "\\n";\n```'})}]) {
    assert.deepEqual(structuredClone(toWebWorkerMessage(new Proxy(data, {}))), data);
  }
});
