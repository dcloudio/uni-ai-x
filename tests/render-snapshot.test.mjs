import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const pure = loadUts('uni_modules/uni-ai-worker/utssdk/render-snapshot.uts',
  ['renderContentKey', 'mapRenderResources', 'validRenderSnapshot', 'RENDER_ASSET_PREFIX', 'RENDER_SNAPSHOT_VERSION']);
const block = (extra = {}) => ({ kind: 'html', key: 'html-1', html: '<p>hello</p>', text: '',
  isComplete: true, language: '', columnWidths: [], rowTextWidths: [], codeTokens: [],
  level: 0, indent: 0, marker: '', quoteDepth: 0, svgSource: '', svgWidth: 0, svgHeight: 0, ...extra });
const snapshot = blocks => ({ version: pure.RENDER_SNAPSHOT_VERSION, bodyKey: pure.renderContentKey('hello'), theme: 'light',
  width: 360, citations: '', assets: [], blocks });

function files() {
  const data = new Map();
  const fs = {
    accessSync(path) { if (!data.has(path)) throw new Error('missing'); },
    mkdirSync(path) { data.set(path, null); },
    writeFileSync(path, content, encoding) { assert.equal(encoding, 'base64'); data.set(path, content); },
    readFileSync(path) { if (!data.has(path)) throw new Error('missing'); return data.get(path); },
    renameSync(from, to) { data.set(to, data.get(from)); data.delete(from); },
    rmdirSync(path) { for (const key of data.keys()) if (key === path || key.startsWith(path + '/')) data.delete(key); },
  };
  const api = loadUts('uni_modules/uni-ai-worker/utssdk/snapshot-files.uts',
    ['persistRenderAssets', 'restoreRenderAssets', 'deleteRenderAssets'], {
      ...pure, uni: { env: { USER_DATA_PATH: '/data' }, getFileSystemManager: () => fs },
    });
  return { ...api, data };
}

test('final display resources persist once and restore without touching Markdown or code text', () => {
  const api = files();
  const image = 'data:image/png;base64,aGVsbG8=';
  const source = snapshot([block({ html: `<p><img class="math" src="${image}" width="42" height="21"></p>`,
    text: image, table: { html: `<img src='${image}'>`, height: '44px' },
    math: { src: image, width: 42, height: 21 }, svgSource: image, mermaidImageSource: image }),
    block({ kind: 'code', key: 'code-1', text: image, codeHtml: image, codeHeight: '38px' })]);
  const before = plain(source);
  const stored = api.persistRenderAssets('m', source);
  assert.equal(stored.assets.length, 1);
  assert.deepEqual(plain(source), before);
  assert.equal(stored.blocks[1].codeHtml, image);
  assert.equal(stored.blocks[0].text, image);
  assert.ok(stored.blocks[0].html.includes(pure.RENDER_ASSET_PREFIX));
  const restored = api.restoreRenderAssets(stored, 'hello');
  assert.ok(restored.blocks[0].html.includes('/data/ai-render-assets/'));
  assert.equal(restored.blocks[0].math.width, 42);
  assert.equal(restored.blocks[1].codeHeight, '38px');
  assert.ok(!JSON.stringify(stored.assets).includes('/data/'));
});

test('cached SVG files are copied to durable assets and deletion is scoped to the message', () => {
  const api = files();
  api.data.set('/cache/formula.svg', 'c3Zn');
  const first = api.persistRenderAssets('m1', snapshot([block({ svgSource: '/cache/formula.svg' })]));
  const second = api.persistRenderAssets('m2', snapshot([block({ svgSource: '/cache/formula.svg' })]));
  api.data.delete('/cache/formula.svg');
  assert.ok(api.restoreRenderAssets(first, 'hello'));
  api.deleteRenderAssets('m1');
  assert.equal(api.restoreRenderAssets(first, 'hello'), null);
  assert.ok(api.restoreRenderAssets(second, 'hello'));
});

test('invalid version, changed source, partial blocks, missing files and traversal reject restoration', () => {
  const api = files();
  const value = snapshot([block()]);
  assert.equal(api.restoreRenderAssets({ ...value, version: 0 }, 'hello'), null);
  assert.equal(api.restoreRenderAssets(value, 'changed'), null);
  assert.equal(api.restoreRenderAssets(snapshot([block({ isComplete: false })]), 'hello'), null);
  assert.equal(api.restoreRenderAssets({ ...value, assets: ['../secret'] }, 'hello'), null);
  assert.equal(api.restoreRenderAssets(snapshot([block({ svgSource: 'uni-ai-asset://../secret' })]), 'hello'), null);
});

test('image snapshots preserve intrinsic dimensions and reject old dimensionless image blocks', () => {
  const api = files();
  const image = block({ kind: 'mermaid', mermaidImageSource: 'data:image/png;base64,aGVsbG8=', svgWidth: 640, svgHeight: 320 });
  const stored = api.persistRenderAssets('sized', snapshot([image]));
  const restored = api.restoreRenderAssets(stored, 'hello');
  assert.equal(restored.blocks[0].svgWidth, 640);
  assert.equal(restored.blocks[0].svgHeight, 320);
  assert.equal(api.restoreRenderAssets(snapshot([block({ kind: 'mermaid', mermaidImageSource: '/old.png' })]), 'hello'), null);
  assert.equal(api.restoreRenderAssets(snapshot([block({ kind: 'image', svgSource: '/old.svg' })]), 'hello'), null);
});

test('message image layout reserves the same proportional height independent of image loading', () => {
  const { messageImageStyle } = loadUts('uni_modules/uni-ai-x/sdk/image-layout.uts', ['messageImageStyle']);
  assert.equal(messageImageStyle(640, 320, 390), 'width:100%;height:150px;');
  assert.equal(messageImageStyle(640, 320, 390, 2), 'width:100%;height:149px;');
  assert.equal(messageImageStyle(640, 320, 1200), 'width:100%;height:355px;');
  assert.equal(messageImageStyle(640, 320, 0), 'width:100%;height:135px;');
});

test('WebView generated Mermaid retains dimensions before notifying persistence', () => {
  const { prepareNativeMermaidBlocks } = loadUts('uni_modules/uni-ai-x/sdk/mermaid-presentation.uts', ['prepareNativeMermaidBlocks'], {
    renderMermaidSvgForTheme: (text, theme, done) => done({ imageSource: '/chart.png', width: 640, height: 320 }),
  });
  const chart = block({ kind: 'mermaid', text: 'gantt' });
  prepareNativeMermaidBlocks([chart], 'light', () => {
    assert.equal(chart.svgWidth, 640);
    assert.equal(chart.svgHeight, 320);
  });
  assert.equal(chart.mermaidImageSource, '/chart.png');
});

function store() {
  const timers = new Map();
  let timerId = 0;
  const work = [];
  const preparations = [];
  let parses = 0;
  const api = loadUts('uni_modules/uni-ai-x/sdk/libmark-stream-store.uts',
    ['libmarkStreamBindMessage', 'libmarkStreamMarkComplete', 'libmarkStreamApply', 'libmarkStreamGetBlocks',
      'libmarkStreamRequestRebuild', 'libmarkStreamRelease', 'libmarkStreamSetTheme'], {
      ref: value => ({ value }), reactive: value => value, ...pure,
      setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
      clearTimeout: id => timers.delete(id),
      LibmarkHtmlStreamAdapter: class { reset() {} },
      requestSnapshotWork: (request, callback) => work.push({ request, callback }),
      requestAiWorkerMarkdownRebuild: () => parses++,
      prepareAndroidPresentation: (id, ops, done, theme, callback) => preparations.push({ id, ops, done, theme, callback }),
      releaseAndroidPresentation() {}, releaseCodeHighlightSessions() {},
      prepareNativeMermaidBlocks() {}, prepareNativeInlineMathBlocks() {}, pluginBackgroundFor: () => '#fff',
    });
  return { ...api, work, preparations, parses: () => parses, tick: () => {
    const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn());
  } };
}

test('failed diagram terminal state persists and asset errors retry without further stream events', async () => {
  const api = store();
  let saved = 0;
  const msg = { _id: 'm', from_uid: 'uni-ai', body: 'hello' };
  await api.libmarkStreamBindMessage(msg, () => saved++);
  api.libmarkStreamMarkComplete('m');
  await Promise.resolve();
  const failed = block({ kind: 'mermaid', mermaidRenderFailed: true, mermaidImageSource: '' });
  api.preparations[0].callback({ action: 'blocks', length: 1, settled: true, body: '', theme: 'light', windowWidth: 360,
    changes: [{ index: 0, block: failed }] });
  assert.equal(api.work.length, 1);
  api.work[0].callback({ snapshot: null });
  api.tick();
  assert.equal(api.work.length, 2);
  api.work[1].callback({ snapshot: snapshot([failed]) });
  assert.equal(saved, 1);
  assert.equal(msg.renderSnapshot.blocks[0].mermaidRenderFailed, true);
});

test('asset retries stop after three retries and are cancelled when a message is released', async () => {
  for (const release of [false, true]) {
    const api = store();
    await api.libmarkStreamBindMessage({ _id: 'm', from_uid: 'uni-ai', body: 'hello' }, () => {});
    api.libmarkStreamMarkComplete('m');
    await Promise.resolve();
    api.preparations[0].callback({ action: 'blocks', length: 1, settled: true, body: '', theme: 'light', windowWidth: 360,
      changes: [{ index: 0, block: block() }] });
    api.work[0].callback({ snapshot: null });
    if (release) api.libmarkStreamRelease('m');
    for (let i = 0; i < 5; i++) { api.tick(); api.work.at(-1).callback({ snapshot: null }); }
    assert.equal(api.work.length, release ? 1 : 4);
  }
});

test('failed native math becomes persistable source text and failed diagrams are not rendered again', () => {
  let renders = 0;
  const { prepareNativeMermaidBlocks } = loadUts('uni_modules/uni-ai-x/sdk/mermaid-presentation.uts', ['prepareNativeMermaidBlocks'], {
    renderMathSvgForTheme: (text, theme, done) => { renders++; done({ imageSource: '' }); },
    renderMermaidSvgForTheme: (text, theme, done) => { renders++; done({ imageSource: '' }); },
  });
  const blocks = [block({ kind: 'math', text: 'invalid math' }), block({ kind: 'mermaid', text: 'invalid diagram' })];
  prepareNativeMermaidBlocks(blocks, 'light', () => {});
  prepareNativeMermaidBlocks(blocks, 'light', () => {});
  assert.equal(renders, 2);
  assert.equal(blocks[0].kind, 'data-text');
  assert.equal(blocks[0].text, 'invalid math');
  assert.equal(blocks[1].mermaidRenderFailed, true);
});

test('APP-ANDROID message retry saves final snapshot and never overwrites a newer write', () => {
  const timers = [];
  const writes = [];
  const { StorageManager } = loadUts('uni_modules/uni-ai-x/sdk/storage-manager.uts', ['StorageManager'], {
    setTimeout: fn => timers.push(fn),
    saveAndroidMessageInBackground: (key, value, done) => writes.push({ value, done }),
    requestSnapshotWork: (request, done) => writes.push({ value: request.message, done: ok => done({ ok }) }),
  }, ['APP', 'APP-ANDROID']);
  const manager = new StorageManager();
  const msg = { _id: 'm', chat_id: 'c', body: 'old', renderSnapshot: snapshot([block()]) };
  manager.updateStreamingMessage(msg);
  writes[0].done(false);
  timers.shift()();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].value.renderSnapshot, msg.renderSnapshot);
  writes[1].done(false);
  manager.updateStreamingMessage({ ...msg, body: 'new' });
  timers.shift()();
  assert.equal(writes.length, 3);
  assert.equal(writes[2].value.body, 'new');
  writes[2].done(true);
});

test('APP-HARMONY message writes persist synchronously and keep the newest content', () => {
  const writes = [];
  const workerCalls = [];
  const { StorageManager } = loadUts('uni_modules/uni-ai-x/sdk/storage-manager.uts', ['StorageManager'], {
    uni: { setStorageSync: (key, value) => writes.push({ key, value }) },
    requestSnapshotWork: () => workerCalls.push(1),
    deleteRenderAssets: () => workerCalls.push(1),
  }, ['APP', 'APP-HARMONY']);
  const manager = new StorageManager();
  const msg = { _id: 'm', chat_id: 'c', body: 'old', renderSnapshot: snapshot([block()]) };
  manager.updateStreamingMessage(msg);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, 'uni-ai-msg-m');
  assert.equal(JSON.parse(writes[0].value).body, 'old');
  manager.updateStreamingMessage({ ...msg, body: 'new' });
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[1].value).body, 'new');
  assert.equal(workerCalls.length, 0);
});

test('restart restores final blocks without invoking parsing and prevents an overlapping rebuild', async () => {
  const api = store();
  const msg = { _id: 'm', from_uid: 'uni-ai', body: 'hello', renderSnapshot: snapshot([block()]) };
  const task = api.libmarkStreamBindMessage(msg, () => assert.fail('restore must not save again'));
  assert.equal(api.libmarkStreamRequestRebuild('m', 'hello'), false);
  api.work[0].callback({ snapshot: msg.renderSnapshot });
  await task;
  assert.equal(api.libmarkStreamGetBlocks('m')[0].html, '<p>hello</p>');
  assert.equal(api.libmarkStreamRequestRebuild('m', 'hello'), false);
  assert.equal(api.parses(), 0);
  assert.equal(api.preparations.length, 0);
});

test('only settled final blocks are saved and deleting the message rejects a late snapshot', async () => {
  const api = store();
  let saves = 0;
  const msg = { _id: 'm', from_uid: 'uni-ai', body: 'hello' };
  await api.libmarkStreamBindMessage(msg, () => saves++);
  api.libmarkStreamMarkComplete('m');
  await Promise.resolve();
  const callback = api.preparations[0].callback;
  callback({ action: 'blocks', length: 1, settled: false,
    changes: [{ index: 0, block: block({ codeHtmlPrefix: 0 }) }] });
  assert.equal(api.work.length, 0);
  callback({ action: 'blocks', length: 1, settled: true, body: '', theme: 'light', windowWidth: 360, changes: [] });
  assert.equal(api.work.length, 1);
  api.libmarkStreamRelease('m');
  api.work[0].callback({ snapshot: snapshot([block()]) });
  assert.equal(saves, 0);
  assert.equal(msg.renderSnapshot, undefined);
});

test('a completed stream stores the full snapshot on its original message', async () => {
  const api = store();
  const saves = [];
  const msg = { _id: 'm', from_uid: 'uni-ai', body: 'hello' };
  await api.libmarkStreamBindMessage(msg, value => saves.push(value));
  api.libmarkStreamMarkComplete('m');
  await Promise.resolve();
  const callback = api.preparations[0].callback;
  const response = { action: 'blocks', length: 1, settled: true, body: '', theme: 'light', windowWidth: 360,
    changes: [{ index: 0, block: block({ codeHtmlPrefix: 0 }) }] };
  callback({ ...response, theme: 'dark' });
  assert.equal(api.work.length, 0);
  callback(response);
  assert.equal(api.work.length, 1);
  const saved = snapshot([block()]);
  api.work[0].callback({ snapshot: saved });
  assert.equal(msg.renderSnapshot, saved);
  assert.equal(saves[0], msg);
});

test('failed cache validation falls back to one deduplicated rebuild', async () => {
  const api = store();
  const msg = { _id: 'm', from_uid: 'uni-ai', body: 'hello', renderSnapshot: snapshot([block()]) };
  const task = api.libmarkStreamBindMessage(msg, () => {});
  api.work[0].callback({ snapshot: null });
  await task;
  assert.equal(api.parses(), 1);
  assert.equal(msg.renderSnapshot, undefined);
  assert.equal(api.libmarkStreamRequestRebuild('m', 'hello'), false);
});

test('background message writes, history and deletion preserve FIFO order and release assets', () => {
  const data = new Map();
  const removed = [];
  const replies = [];
  const { AiSnapshotWorkerTask } = loadUts('workers/aiSnapshotWorkerTask.uts', ['AiSnapshotWorkerTask'], {
    WorkerTaskImpl: class { postMessage(value) { replies.push(value); } },
    uni: { getStorageSync: key => data.get(key) ?? '', setStorageSync: (key, value) => data.set(key, value),
      removeStorageSync: key => data.delete(key) },
    deleteRenderAssets: id => removed.push(id),
  }, ['APP', 'APP-HARMONY']);
  const task = new AiSnapshotWorkerTask();
  const message = { _id: 'm', chat_id: 'c', body: 'hello', from_uid: 'uni-ai', create_time: 1 };
  task.onMessage({ id: 1, action: 'add-message', message });
  task.onMessage({ id: 2, action: 'save-message', message: { ...message, renderSnapshot: snapshot([block()]) } });
  task.onMessage({ id: 3, action: 'history', chatId: 'c' });
  assert.equal(replies.at(-1).messages[0].renderSnapshot.blocks[0].html, '<p>hello</p>');
  task.onMessage({ id: 4, action: 'remove-messages', chatId: 'c', messageIds: ['m'] });
  task.onMessage({ id: 5, action: 'history', chatId: 'c' });
  assert.equal(replies.at(-1).messages.length, 0);
  assert.deepEqual(removed, ['m']);
  assert.equal(data.has('uni-ai-msg-m'), false);
});
