import test from 'node:test';
import assert from 'node:assert/strict';
import { removeTrackRows } from '../apps/desktop/src/forms/contentTracks.ts';

test('removing a nested track keeps its disc, siblings and all other discs', () => {
  const rows = [{ title: 'Disc 1', sub_tracks: [{ title: 'one' }, { title: 'two' }] },
    { title: 'Disc 2', sub_tracks: [{ title: 'three' }, { title: 'four' }] }];
  const original = structuredClone(rows);
  const result = removeTrackRows(rows, [0, 1]);
  assert.deepEqual(result, [{ title: 'Disc 1', sub_tracks: [{ title: 'one' }] }, rows[1]]);
  assert.deepEqual(rows, original);
  assert.deepEqual(removeTrackRows(rows, [1]), [rows[0]]);
  assert.deepEqual(removeTrackRows(rows, [4, 0]), rows);
});
