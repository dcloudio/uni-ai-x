import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = await readFile(new URL('../uni_modules/uni-ai-x/sdk/streaming-code-tokens.uts', import.meta.url), 'utf8');
const { streamingCodeTokens } = await import('data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const render = tokens => tokens.map(line => line.map(token => token.text ?? '').join('')).join('\n');
const cached = [[{ text: 'const', className: 'keyword' }, { text: ' answer = 1' }]];

test('keeps existing colors through successive appends while highlighting is pending', () => {
    for (const suffix of [';', ';\n', ';\nreturn', ';\nreturn answer;']) {
        const text = 'const answer = 1' + suffix;
        const result = streamingCodeTokens(text, cached);
        assert.equal(render(result), text);
        assert.equal(result[0][0].className, 'keyword');
    }
    assert.equal(render(cached), 'const answer = 1');
});

test('uses a complete highlight result unchanged', () => {
    assert.equal(streamingCodeTokens('const answer = 1', cached), cached);
});

test('rejects stale highlights after replacements or deletion', () => {
    for (const text of ['let answer = 1', 'const answer', '', 'unrelated']) {
        assert.deepEqual(streamingCodeTokens(text, cached), []);
    }
});

test('preserves blank lines, trailing newlines, and unicode in the appended suffix', () => {
    const text = 'const answer = 1\n\n// 中文 😀\n';
    assert.equal(render(streamingCodeTokens(text, cached)), text);
});

test('handles an existing trailing newline and normalizes CRLF', () => {
    const tokens = [...cached, []];
    const text = 'const answer = 1\r\nreturn answer\r\n';
    assert.equal(render(streamingCodeTokens(text, tokens)), text.replace(/\r\n/g, '\n'));
});

test('does not mutate frozen cached arrays or reuse empty highlight text', () => {
    const frozen = Object.freeze(cached.map(line => Object.freeze([...line])));
    assert.equal(render(streamingCodeTokens('const answer = 12', frozen)), 'const answer = 12');
    assert.deepEqual(streamingCodeTokens('next', []), []);
    assert.deepEqual(streamingCodeTokens('next', [[]]), []);
});
