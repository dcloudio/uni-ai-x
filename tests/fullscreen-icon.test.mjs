import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadUts } from './uts-loader.mjs';
test('fullscreen collapse icon is inward arrows, never the loading ring from bb978ef', () => {
  const { artwork } = loadUts('uni_modules/uni-ai-x/components/uni-ai-icon/artwork.uts', ['artwork'], { Map });
  const icon = artwork.get('compact-outline');
  assert.ok(icon?.includes('<svg'));
  assert.ok(icon.includes('M9 3V7H13'));
  assert.equal(/<circle|opacity=|14\.5/.test(icon), false);
  const template = readFileSync('uni_modules/uni-ai-x/components/uni-ai-chat-input/uni-ai-chat-input.uvue', 'utf8');
  assert.ok(template.includes("isFullscreen ? 'compact-outline' : 'fullscreen-outline'"));
});
