import test from 'node:test';
import assert from 'node:assert/strict';
import { captionSteps } from '../apps/desktop/src/playback/captionTiming.ts';

function visible(cue, at) {
  const steps = captionSteps(cue).filter(step => step.at <= at);
  return [cue.text.slice(0, Math.max(0, ...steps.map(s => s.sourceEnd))).trimEnd(),
    cue.translation?.slice(0, Math.max(0, ...steps.map(s => s.translationEnd))).trimEnd()];
}

test('English words stay whole across subword tokens and punctuation follows the word', () => {
  const cue = { start: 1, end: 4, text: 'Good morning!', marks: [
    { index: 0, start: 1.2, end: 1.6 }, { index: 4, start: 2.1, end: 2.5 }, { index: 9, start: 2.5, end: 3 },
  ] };
  assert.equal(visible(cue, 1.1)[0], '');
  assert.equal(visible(cue, 1.3)[0], 'Good');
  assert.equal(visible(cue, 2.2)[0], 'Good morning!');
});

test('CJK text and translation reveal progressively, preserving combining marks', () => {
  const cue = { start: 5, end: 8, text: 'か\u3099く。', translation: '上学。', marks: [{ index: 0, start: 5.5, end: 7.1 }] };
  assert.deepEqual(visible(cue, 5.4), ['', '']);
  assert.deepEqual(visible(cue, 5.6), ['か\u3099', '上']);
  assert.deepEqual(visible(cue, 7.6), ['か\u3099く。', '上学。']);
});

test('a final token stamped at cue end is visible before the line disappears', () => {
  const cue = { start: 0, end: 2, text: '说完', marks: [{ index: 0, start: 0.1, end: 1 }, { index: 1, start: 2, end: 2 }] };
  assert.equal(visible(cue, 1.9)[0], '说完');
});
