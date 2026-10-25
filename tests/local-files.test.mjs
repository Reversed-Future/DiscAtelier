import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseItem, matchTrackNumber, parseEpisode, parseTrack } from '../apps/desktop/src/local/match.ts';

const item = (id, categoryId, title, creator = '') => ({ id, edition: { categoryId, title, creator } });

test('episode markers map S01E03, Chinese episode labels, EP and leading numbers', () => {
  assert.equal(parseEpisode('Show.S01E03.1080p.mkv'), 3);
  assert.equal(parseEpisode('第 04 集.mkv'), 4);
  assert.equal(parseEpisode('EP07.mkv'), 7);
  assert.equal(parseEpisode('05.mkv'), 5);
  assert.equal(parseEpisode('S2E12.mkv'), 12);
});

test('track markers map leading numbers, CD/Track labels and separated numbers', () => {
  assert.equal(parseTrack('01 - Anti Anti overture.flac'), 1);
  assert.equal(parseTrack('CD03 - tazuna.flac'), 3);
  assert.equal(parseTrack('Track 12.flac'), 12);
  assert.equal(parseTrack('Album 09 - song.flac'), 9);
});

test('song titles fill the track number even without a numeric prefix', () => {
  const tracks = [
    { title: 'Ridiculous', position: '1' },
    { title: 'HIGH-VELOCITY', position: '5' },
    { title: 'Action 68', position: '6' },
  ];
  assert.equal(matchTrackNumber('7mai - Ridiculous.flac', tracks), 1);
  assert.equal(matchTrackNumber('Aiobahn - HIGH-VELOCITY.flac', tracks), 5);
  assert.equal(matchTrackNumber('KARUT - Action 68.flac', tracks), 6);
});

test('folder and file names choose the matching music or video item', () => {
  const items = [
    item('music-1', 'music', 'ANTI ANTI GENERATION', 'RADWIMPS'),
    item('video-1', 'video', 'Blue Archive Original Soundtrack', 'Nor'),
  ];
  assert.equal(chooseItem(items, { relativePath: 'RADWIMPS - ANTI ANTI GENERATION/01 - tazuna.flac', name: '01 - tazuna.flac' })?.id, 'music-1');
  assert.equal(chooseItem(items, { relativePath: 'Blue Archive/S01E02.mkv', name: 'S01E02.mkv' })?.id, 'video-1');
  assert.equal(chooseItem(items, { relativePath: 'Unmatched/01.mkv', name: '01.mkv' }), null);
  assert.equal(chooseItem(items, { relativePath: 'Unmatched/01.mkv', name: '01.mkv' }, true)?.id, 'video-1');
});
