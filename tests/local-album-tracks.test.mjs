import test from 'node:test';
import assert from 'node:assert/strict';
import { albumTrackRefs, matchAlbumTrack, parseDiscHint } from '../apps/desktop/src/local/albumTrackRefs.ts';

const track = (position, title, extra = {}) => ({ title, position, duration: '', type_: 'track', sub_tracks: [], ...extra });
const heading = (position, title, extra = {}) => ({ title, position, duration: '', type_: 'heading', heading_kind: 'disc', sub_tracks: [], ...extra });

const cd = Array.from({ length: 13 }, (_, i) => track(`CD-${i + 1}`, i === 0 ? 'DayLight -デイライト-' : i === 3 ? 'Grand Escape' : i === 12 ? 'Ever Sky Blue' : `CD Song ${i + 1}`));
const bd = [track('BD1-1', 'Grand Escape'), track('BD1-2', 'BD Song')];
const refs = () => albumTrackRefs([heading('CD-1', 'Quintet'), ...cd, heading('BD1-1', 'Live'), ...bd], 'Quintet', 0);

test('disc pages exclude disc headings and keep per-disc numbering', () => {
  const rows = refs();
  assert.deepEqual(rows.filter(row => row.disc === 'CD').map(row => row.number), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.deepEqual(rows.filter(row => row.disc === 'BD1').map(row => row.number), [1, 2]);
  assert.equal(rows.find(row => row.title === 'Ever Sky Blue').number, 13);
});

test('auto match finds the first CD song at track 1, not 2', () => {
  const match = matchAlbumTrack('DayLight -デイライト-.wav', refs(), 'Disc 1');
  assert.equal(match?.title, 'DayLight -デイライト-');
  assert.equal(match?.number, 1);
  assert.equal(match?.disc, 'CD');
  assert.equal(matchAlbumTrack('Ever Sky Blue.wav', refs())?.number, 13);
});

test('duplicate CD/BD titles need a disc hint and never cross discs', () => {
  assert.equal(matchAlbumTrack('Grand Escape.flac', refs()), null);
  assert.equal(matchAlbumTrack('Grand Escape.flac', refs(), 'Disc 2')?.disc, 'BD1');
  assert.equal(matchAlbumTrack('Grand Escape.flac', refs(), 'CD1')?.disc, 'CD');
  assert.deepEqual(parseDiscHint('CD2'), { kind: 'CD', number: 2 });
});
