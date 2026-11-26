import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, longestPlaylist, markIndexAt, playlistOptionLabel, segmentMarks } from '../apps/desktop/src/optical/bluraySegments.ts';

const segment = (index, startSeconds, durationSeconds, extra = {}) => ({
  index, clipId: String(index + 1).padStart(5, '0'), startSeconds, durationSeconds, seamless: true, angleCount: 1, ...extra,
});
const playlist = (name, durationSeconds, segments) => ({ playlist: name, durationSeconds, segments, chapters: [] });

test('the main feature is the longest playlist, not the first file', () => {
  const rows = [
    playlist('00000.mpls', 42, [segment(0, 0, 42)]),
    playlist('00001.mpls', 6780, [segment(0, 0, 3000), segment(1, 3000, 3780)]),
    playlist('00800.mpls', 120, [segment(0, 0, 120)]),
  ];
  assert.equal(longestPlaylist(rows).playlist, '00001.mpls');
  assert.equal(longestPlaylist([]), null);
  assert.equal(longestPlaylist([playlist('bad.mpls', Number.NaN, [])]), null);
});

test('equal durations prefer more segments, then a stable file name', () => {
  const split = playlist('00900.mpls', 100, [segment(0, 0, 50), segment(1, 50, 50)]);
  const single = playlist('00100.mpls', 100, [segment(0, 0, 100)]);
  assert.equal(longestPlaylist([single, split]).playlist, '00900.mpls');
  const other = playlist('00800.mpls', 100, [segment(0, 0, 100)]);
  assert.equal(longestPlaylist([single, other]).playlist, '00100.mpls');
});

test('option labels expose full duration and segment count', () => {
  const value = playlist('00001.mpls', 7112.4, [segment(0, 0, 3000), segment(1, 3000, 4112.4)]);
  assert.equal(formatDuration(value.durationSeconds), '1:58:32');
  assert.equal(playlistOptionLabel(value), '00001.mpls · 1:58:32 · 2 段');
  assert.equal(playlistOptionLabel(playlist('00002.mpls', 61, [segment(0, 0, 61)])), '00002.mpls · 1:01');
});

test('segment marks cover the full movie timeline and skip empty items', () => {
  const value = playlist('00001.mpls', 150, [
    segment(0, 0, 60),
    segment(1, 60, 0),
    segment(2, 60, 60),
    segment(3, 120, 30),
  ]);
  const marks = segmentMarks(value);
  assert.deepEqual(marks.map(mark => [mark.startSeconds, mark.endSeconds]), [[0, 60], [60, 120], [120, 150]]);
  assert.equal(marks[1].label, '第 3 段 · 00003');
  assert.equal(markIndexAt(marks, 0), 0);
  assert.equal(markIndexAt(marks, 59.99), 0);
  assert.equal(markIndexAt(marks, 60), 1);
  assert.equal(markIndexAt(marks, 149), 2);
  assert.equal(markIndexAt([], 10), -1);
});

test('a single-item playlist has no divider bar and malformed starts fall back', () => {
  assert.deepEqual(segmentMarks(playlist('00000.mpls', 100, [segment(0, 0, 100)])), []);
  const marks = segmentMarks(playlist('00001.mpls', 100, [
    segment(0, Number.NaN, 40),
    segment(1, 40, 60),
  ]));
  assert.deepEqual(marks.map(mark => mark.startSeconds), [0, 40]);
});
