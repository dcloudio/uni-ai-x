import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function setup(initial = new Map()) {
  const storage = initial;
  const protectedSources = [];
  let renders = 0;
  const api = loadUts('uni_modules/uni-ai-x/sdk/themed-svg.uts', [
    'renderMathSvgForTheme', 'renderMermaidSvgForTheme', 'mathCache', 'mermaidCache', 'persistentOrder',
  ], {
    uni: {
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: key => storage.get(key) ?? '',
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key),
    },
    getHarmonySvgWorkaroundConfig: () => ({ cacheVariant: 'test', rasterScale: 1, enabled: false, useFileSource: false }),
    prepareHarmonySvgImageSource: (source, _file, callback) => callback(source, true),
    cleanupPreviousSvgFiles: sources => protectedSources.push(...sources),
    utils: { runOnDispatcher: (_dispatcher, callback) => callback() },
    proxyWeb: {
      getGeneration: () => 0, notifyRequest() {},
      callMethod: (request, callback) => {
        renders++;
        callback({ imageDataURL: 'data:image/svg+xml;base64,' + (request.pureMathText ?? request.mermaidText), width: 100, height: 50 });
      },
    }, setTimeout, clearTimeout,
  }, ['WEB']);
  return { ...api, storage, protectedSources, renders: () => renders };
}

test('formula and diagram caches are bounded while evicted results can render again', () => {
  const api = setup();
  for (let i = 0; i < 80; i++) {
    api.renderMathSvgForTheme('math-' + i, 'light', result => assert.ok(result.imageSource));
    api.renderMermaidSvgForTheme('graph-' + i, 'light', result => assert.ok(result.imageSource));
  }
  assert.equal(api.mathCache.size, 64);
  assert.equal(api.mermaidCache.size, 64);
  assert.equal(api.persistentOrder.length, 64);
  assert.equal(api.storage.size, 65);
  const before = api.renders();
  api.renderMathSvgForTheme('math-0', 'light', () => {});
  assert.equal(api.renders(), before + 1);
});

test('large image results are displayed without being retained beyond cache budgets', () => {
  const api = setup();
  const source = 'x'.repeat(1100000);
  let delivered = false;
  api.renderMermaidSvgForTheme(source, 'light', result => { delivered = result.imageSource.length > source.length; });
  assert.equal(delivered, true);
  assert.equal(api.mermaidCache.size, 0);
  assert.equal(api.persistentOrder.length, 0);
});

test('legacy persistent entries are trimmed and retained files are protected from startup cleanup', async () => {
  const storage = new Map();
  for (let i = 0; i < 80; i++) storage.set('uni-ai-mermaid-cache-' + i, JSON.stringify({ imageSource: '/cache/' + i + '.svg', width: 1, height: 1, theme: 'light' }));
  const api = setup(storage);
  api.renderMathSvgForTheme('x', 'light', () => {});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(storage.size, 65);
  assert.equal(api.protectedSources.length, 64);
  assert.ok(api.protectedSources.includes('/cache/79.svg'));
  assert.ok(!api.protectedSources.includes('/cache/0.svg'));
});

test('file cleanup removes only previous-run managed orphans, preserving retained and new images', async () => {
  let readDirectory;
  const deleted = [];
  let created;
  const api = loadUts('uni_modules/uni-ai-x/sdk/harmony-svg-workaround.uts', ['cleanupPreviousSvgFiles', 'prepareHarmonySvgImageSource'], {
    uni: { env: { CACHE_PATH: '/cache' }, getFileSystemManager: () => ({
      readdir: options => { readDirectory = options.success; },
      mkdir: options => options.success(),
      writeFile: options => { created = options.filePath; options.success(); },
      unlink: options => { deleted.push(options.filePath); options.complete(); },
    }) }, setTimeout,
  }, ['APP', 'APP-ANDROID']);
  api.cleanupPreviousSvgFiles(['/cache/ai-svg-cache/1-1.svg']);
  api.prepareHarmonySvgImageSource('data:image/svg+xml;base64,PHN2Zy8+', true, () => {});
  readDirectory({ files: ['1-1.svg', '2-1.svg', 'user-file.svg', created.split('/').at(-1)] });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(deleted, ['/cache/ai-svg-cache/2-1.svg']);
});
