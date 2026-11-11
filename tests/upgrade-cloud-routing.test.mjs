import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../uni_modules/uni-upgrade-center-app/utils/call-check-version.ts', import.meta.url), 'utf8')
  .split('export type StoreListItem')[0].replace(/^export /gm, '');

test('only the project App ID uses its dedicated upgrade cloud space', () => {
  const defaultCloud = { callFunction() {}, getTempFileURL() {} };
  const projectCloud = { callFunction() {}, getTempFileURL() {} };
  for (const [appId, expected, shouldInitialize] of [
    ['__UNI__C50103A', projectCloud, true],
    ['__UNI__OTHER', defaultCloud, false],
    ['', defaultCloud, false],
  ]) {
    let configuration = null;
    const uniCloud = { ...defaultCloud, init(options) { configuration = options; return projectCloud; } };
    const { upgradeCloud } = vm.runInNewContext(
      `${stripTypeScriptTypes(source)};\n({ upgradeCloud })`,
      { uniCloud, uni: { getSystemInfoSync: () => ({ appId }) } });

    assert.equal(upgradeCloud, shouldInitialize ? expected : uniCloud);
    assert.equal(configuration?.provider ?? null, shouldInitialize ? 'aliyun' : null);
  }
});
