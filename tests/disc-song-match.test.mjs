import test from 'node:test';
import assert from 'node:assert/strict';
import { trackMatches, trackKey } from '../apps/desktop/src/integrations/trackMatches.ts';
import { albumMatches } from '../apps/desktop/src/integrations/albumTracks.ts';
import { collectionQueue } from '../apps/desktop/src/playback/collectionQueue.ts';
import { album, albums, cd, tracks, media } from './fixtures/disc-song-match.mjs';

test('screenshot CD titles match regardless of case and punctuation without BD duplicate interference', () => {
  const before = JSON.stringify({ tracks, albums });
  // The previous whole-edition comparison found only the two non-repeated songs.
  assert.deepEqual([...trackMatches(tracks, album, [], { includeVideo: true }).values()].map(song => song.id), [2, 5]);
  for (const physical of [0, media]) {
    const matches = albumMatches(tracks, albums, [], [], physical);
    assert.deepEqual(cd.map(row => matches.get(trackKey(row))?.id), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(matches.size, 7);
    assert.deepEqual(collectionQueue('fixture', 1, albums, [], tracks, [], physical).tracks.map(song => song.id), [1, 2, 3, 4, 5, 6, 7]);
  }
  assert.equal(trackMatches(tracks, album).size, 7);
  assert.equal(JSON.stringify({ tracks, albums }), before);
});

test('physical video media with opaque positions stay manual until a disc album is chosen', () => {
  const rows = [{ title: cd[0].title, position: 'source-row', duration: '', type_: 'track', disc_number: 2 }];
  assert.equal(albumMatches(rows, albums, [], [], media).size, 0);
  assert.equal(albumMatches(rows, albums, [], [{ discKey: 'manual:2', albumId: 100 }], media).get(trackKey(rows[0])).id, 1);
  const links = [{ position: rows[0].position, title: rows[0].title, song: album.tracks[1] }];
  assert.equal(albumMatches(rows, albums, links, [], media).get(trackKey(rows[0])).id, 2);
});

test('BD and DVD album selections remain usable and independent of the CD list', () => {
  for (const position of ['BD1-1', 'DVD-1', 'BR1']) {
    const row = { ...cd[0], position };
    assert.equal(trackMatches([row], album).size, 0);
    assert.equal(trackMatches([row], album, [], { includeVideo: true }).get(trackKey(row)).id, 1);
  }
  const matches = albumMatches(tracks, albums, [], [{ discKey: 'BD1', albumId: 100 }], media);
  assert.equal(matches.get(trackKey(tracks.find(row => row.position === 'BD1-1'))).id, 1);
  assert.equal(matches.has(trackKey(tracks.find(row => row.position === 'BD2-1'))), false);
});

test('same titles on separate audio discs do not require missing durations to prove uniqueness', () => {
  const rows = [1, 2].map(disc_number => ({ ...cd[0], position: `source-${disc_number}`, disc_number }));
  const audioMedia = [{ carrierId: 'cd', label: 'CD' }, { carrierId: 'cd', label: 'CD' }];
  assert.equal(albumMatches(rows, albums, [], [], audioMedia).size, 2);
  assert.equal(trackMatches([{ ...cd[0], position: '1' }, { ...cd[0], position: '2' }], album).size, 0);
});
