import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitleFile, fileTextAt } from '../apps/desktop/src/playback/subtitleFile.ts';

test('SRT cues retain multiline dialogue, and clear at the boundary and on backward seek', () => {
  const rows = parseSubtitleFile('\uFEFF2\r\n00:00:05,250 --> 00:00:06,125\r\n再见\r\n\r\n1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>你好</i>\r\nHello');
  assert.equal(fileTextAt(rows, 6), '再见');
  assert.equal(fileTextAt(rows, 2), '你好\nHello');
  assert.equal(fileTextAt(rows, 3), '');
  assert.equal(fileTextAt(rows, 0), '');
});

test('WebVTT supports cue identifiers, minute timestamps and position settings', () => {
  const rows=parseSubtitleFile('WEBVTT\n\nfirst\n01:02.200 --> 01:03.400 align:start\nA &amp; B');
  assert.equal(fileTextAt(rows,62.3),'A & B');
  assert.equal(fileTextAt(rows,63.4),'');
});
