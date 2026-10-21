import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyHistory, nextSong, parseHistory, rememberAlbum } from '../apps/desktop/src/playback/musicQueue.ts';
const album = (id = 1) => ({ editionId: `edition-${id}`, albumId: id, title: 'Album', artists: ['Artist'], lastSongId: 10,
  tracks: [10, 20, 30].map((id, i) => ({ id, title: `Track ${id}`, artists: ['Artist'], disc: '1', number: i + 1, durationMs: 180000 })) });
test('album history deduplicates, moves replayed album to front and keeps exactly three recent albums', () => {
  let rows = [];
  for (const id of [1, 2, 3, 4]) rows = rememberAlbum(rows, album(id));
  assert.deepEqual(rows.map(row => row.albumId), [4, 3, 2]);
  rows = rememberAlbum(rows, { ...album(3), lastSongId: 20 });
  assert.deepEqual(rows.map(row => row.albumId), [3, 4, 2]);
  assert.equal(rows[0].lastSongId, 20);
});
test('whole-album loop wraps both directions and single repeat applies only to automatic advancement', () => {
  assert.equal(nextSong(album(), 30, 'list', 1, true), 10);
  assert.equal(nextSong(album(), 10, 'list', -1), 30);
  assert.equal(nextSong(album(), 20, 'one', 1, true), 20);
  assert.equal(nextSong(album(), 20, 'one', 1), 30);
  assert.equal(nextSong(album(), 999, 'list'), null);
  assert.equal(nextSong({ ...album(), tracks: [album().tracks[0]] }, 10, 'list', 1, true), 10);
});
test('history reload retains complete queue and mode but strips unknown fields and rejects broken storage', () => {
  const input = { version: 1, mode: 'one', albums: [{ ...album(), cookie: 'never-store', tracks: album().tracks.map(track => ({ ...track, url: 'never-store' })) }] };
  const output = parseHistory(JSON.stringify(input));
  assert.deepEqual(output, { version: 1, mode: 'one', albums: [album()] });
  assert.equal(JSON.stringify(output).includes('never-store'), false);
  for (const raw of [null, 'broken', '{}', JSON.stringify({ ...input, version: 2 })]) assert.deepEqual(parseHistory(raw), emptyHistory());
  assert.deepEqual(parseHistory(JSON.stringify({ ...input, albums: [{ ...album(), lastSongId: 999 }] })).albums, []);
});
