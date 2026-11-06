import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

test('Android search accepts a JSON response and injects numbered sources', async () => {
  let requestOptions;
  let registeredTask;
  const task = { abort() {} };
  const { webSearchForRequest } = loadUts('uni_modules/uni-ai-x/sdk/web-search.uts',
    ['webSearchForRequest'], {
      uni: {
        request(options) {
          requestOptions = options;
          queueMicrotask(() => options.success({ statusCode: 200, data: {
            success: true,
            data: { results: [
              { title: '敏捷开发指南', url: 'https://example.com/agile', content: '迭代交付。' },
              { title: '重复来源', url: 'https://example.com/agile#section', content: '重复内容。' },
            ] },
          } }));
          return task;
        },
      },
    });

  const messages = [{ role: 'user', content: '敏捷开发是什么？' }];
  const prepared = await webSearchForRequest('敏捷开发是什么？', 'temporary-token',
    'https://example.com/search', messages, value => { registeredTask = value; });

  assert.equal(requestOptions.dataType, 'json');
  assert.equal(registeredTask, task);
  assert.equal(prepared.sources.length, 1);
  assert.equal(prepared.sources[0].url, 'https://example.com/agile');
  assert.match(prepared.messages[0].content, /\[1\] 敏捷开发指南/);
  assert.equal(messages[0].content, '敏捷开发是什么？');
});
