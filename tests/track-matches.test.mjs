import test from 'node:test';
import assert from 'node:assert/strict';
import { trackKey, trackMatches } from '../apps/desktop/src/integrations/trackMatches.ts';
const track = (title, position = '1', duration = '') => ({ title, position, duration, type_: 'track' });
const song = (id, title, durationMs = 180000) => ({ id, title, durationMs, disc: '1', number: id, artists: ['Artist'] });
const album = tracks => ({ tracks, links: [] });

test('exact unique titles within the saved album match without modifying either source', () => {
  const rows = [track('Song', '1', '3:01'), track('Other', '2')];
  const saved = album([song(42, 'Song'), song(43, 'Other')]);
  const before = JSON.stringify([rows, saved]);
  const matches = trackMatches(rows, saved);
  assert.equal(matches.get(trackKey(rows[0])).id, 42);
  assert.equal(matches.get(trackKey(rows[1])).id, 43);
  assert.equal(JSON.stringify([rows, saved]), before);
});
test('case, edition suffixes, conflicting durations, duplicate titles and DVDs are not guessed', () => {
  for (const rows of [[track('song')], [track('Song (Live)')], [track('Song','1','3:30')], [track('Song','1'),track('Song','2')], [track('Song','DVD-1')]]) {
    assert.equal(trackMatches(rows, album([song(42,'Song')])).size, 0);
  }
  assert.equal(trackMatches([track('Song')], album([song(42,'Song'),song(43,'Song')])).size,0);
});
test('explicit saved links resolve ambiguity and nested tracks remain matchable', () => {
  const row = track('Discogs spelling','CD-1');
  const saved = album([song(42,'Online spelling')]);
  saved.links = [{ position:row.position, title:row.title, songId:42 }];
  assert.equal(trackMatches([row],saved).get(trackKey(row)).id,42);
  assert.equal(trackMatches([{...track('Suite'),sub_tracks:[track('Song','1.1')]}],album([song(44,'Song')])).get(trackKey(track('Song','1.1'))).id,44);
});
