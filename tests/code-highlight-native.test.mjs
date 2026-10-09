import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

for (const platform of ['APP-ANDROID', 'APP-HARMONY']) {
  test(`${platform} uses the native class and preserves highlighted text`, async () => {
    let constructors = 0;
    class CreateHighLighter {
      constructor(options) {
        constructors++;
        assert.ok(options.languages.javascript);
      }
      async tokenizeFullText(language, text) {
        assert.equal(language, 'javascript');
        return text.split('\n').map(line => ({ tokens: [
          { startIndex: 0, endIndex: 5, scopes: ['source.js', 'storage.type.js'] },
          { startIndex: 5, endIndex: line.length + 1, scopes: ['source.js'] },
        ] }));
      }
    }
    const api = loadUts('uni_modules/uni-ai-x/sdk/parseCode.uts', ['parseCodeText'], {
      CreateHighLighter,
      MarkdownToken: {},
      uni: { getFileSystemManager: () => ({ readFileSync: path => readFileSync(
        new URL('..' + path, import.meta.url), 'utf8') }) },
      utils: { runOnDispatcher: (_dispatcher, callback) => callback() },
      measureCodePerformance() {},
    }, ['APP', platform]);
    const text = 'const value = "中文😀";';
    for (let i = 0; i < 2; i++) {
      const result = await new Promise(resolve => api.parseCodeText(resolve, text, 'js'));
      assert.equal(result.error, null);
      assert.equal(result.lines[0].map(token => token.text).join(''), text);
      assert.equal(result.lines[0][0].className, 'storage');
    }
    assert.equal(constructors, 1);
  });
}
