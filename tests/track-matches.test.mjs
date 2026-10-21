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
test('edition suffixes, conflicting durations, ambiguous duplicate titles and DVDs remain unlinked', () => {
  for (const rows of [[track('Song (Live)')], [track('Song','1','3:30')], [track('Song','1'),track('Song','2')], [track('Song','DVD-1')]]) {
    assert.equal(trackMatches(rows, album([song(42,'Song')])).size, 0);
  }
  assert.equal(trackMatches([track('Song')], album([song(42,'Song'),song(43,'Song')])).size,0);
});

test('traditional and simplified titles, width, punctuation and case match without altering original link keys', () => {
  const rows = [track('運氣來得若有似無'), track('ＬＯＶＥ　— “Song”', '2', '3:05')];
  const saved = album([song(42,'运气来得若有似无'), song(43,'love song')]);
  const before = JSON.stringify([rows, saved]);
  const matches = trackMatches(rows, saved);
  assert.equal(matches.get(trackKey(rows[0])).id, 42);
  assert.equal(matches.get(trackKey(rows[1])).id, 43);
  assert.equal(JSON.stringify([rows,saved]), before);
  assert.equal(trackMatches([track('Song (Instrumental)')], album([song(42,'Song')])).size, 0);
});

test('repeated titles need unambiguous disc, track number and duration agreement', () => {
  const rows = [track('序曲','1-1','3:00'), track('序曲','2-1','4:00')];
  const saved = album([{...song(42,'序曲'),disc:'1',number:1}, {...song(43,'序曲',240000),disc:'2',number:1}]);
  const matches = trackMatches(rows,saved);
  assert.equal(matches.get(trackKey(rows[0])).id,42);
  assert.equal(matches.get(trackKey(rows[1])).id,43);
  assert.equal(trackMatches([track('序曲','A1','3:00')],saved).size,0);
  assert.equal(trackMatches([track('序曲','1-1')],saved).size,0);
});

test('manual assignments take priority and reserve their song from automatic matching', () => {
  const rows = [track('different','1'), track('Song','2')];
  const saved = album([song(42,'Song')]);
  saved.links=[{position:'1',title:'different',songId:42}];
  const matches=trackMatches(rows,saved);
  assert.equal(matches.size,1);
  assert.equal(matches.get(trackKey(rows[0])).id,42);
});
test('explicit saved links resolve ambiguity and nested tracks remain matchable', () => {
  const row = track('Discogs spelling','CD-1');
  const saved = album([song(42,'Online spelling')]);
  saved.links = [{ position:row.position, title:row.title, songId:42 }];
  assert.equal(trackMatches([row],saved).get(trackKey(row)).id,42);
  assert.equal(trackMatches([{...track('Suite'),sub_tracks:[track('Song','1.1')]}],album([song(44,'Song')])).get(trackKey(track('Song','1.1'))).id,44);
});
