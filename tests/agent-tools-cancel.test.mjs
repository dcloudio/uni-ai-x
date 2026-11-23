import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

for (const stage of ['discovery', 'tool']) {
  test(`stopping during ${stage} backoff prevents another network attempt`, async () => {
    let cancelled = false;
    let calls = 0;
    class McpRequestError extends Error { retryable = true; delayMs = 0; }
    const api = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts', ['listMcpTools', 'executeMcpTool'], {
      mcpServers: [], McpClient: class {}, CustomProviderAdapter: class {}, McpRequestError,
      console: { error() {} },
      setTimeout(fn) { cancelled = true; queueMicrotask(fn); },
    });
    const request = async () => { calls++; throw new McpRequestError('temporary failure'); };
    const client = { config: { id: 'weather', url: 'https://example.test' }, hasCachedTools: () => false, listTools: request, callTool: request };
    const callbacks = { isCancelled: () => cancelled };
    await assert.rejects(stage === 'discovery' ? api.listMcpTools(client, callbacks) : api.executeMcpTool({ client, remoteName: 'forecast' }, '{}', callbacks));
    assert.equal(calls, 1);
  });
}
