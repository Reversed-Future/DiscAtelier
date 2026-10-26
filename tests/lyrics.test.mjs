import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lyricLines, activeLyric } from '../apps/desktop/src/playback/lyrics.ts';
import { linkedLyricSong } from '../apps/desktop/src/playback/linkedLyricSong.ts';
import { discPages } from '../apps/desktop/src/metadata/discTracks.ts';
import { trackNumberAt } from '../apps/desktop/src/local/match.ts';
import { tracks, albums, media, cd } from './fixtures/disc-song-match.mjs';

test('LRC handles offsets, repeated timestamps, fractions, blank cues and plain text', () => {
  const value = parseLrc('\uFEFF[ar:fixture]\r\n[offset:-500]\r\n[00:02.50][00:04.500]同一行\r\n[00:01.2]\r\n[00:99]invalid\r\n说明');
  assert.deepEqual(value.timed, [{ seconds: .7, text: '' }, { seconds: 2, text: '同一行' }, { seconds: 4, text: '同一行' }]);
  assert.deepEqual(value.plain, ['说明']);
  assert.equal(parseLrc('[offset:-2000]\n[00:01]start').timed[0].seconds, 0);
});
test('translation joins by timestamp and seeking backwards selects the correct cue', () => {
  const { lines } = lyricLines({ original: '[00:01]a\n[00:03]b\n[00:05]c', translation: '[00:03.01]乙', romanization: '' });
  assert.equal(lines[1].translation, '乙');
  assert.deepEqual([0, 1, 3, 20, 2].map(time => activeLyric(lines, time)), [-1, 0, 1, 2, 0]);
  assert.equal(activeLyric([], 100), -1);
  assert.deepEqual(lyricLines({ original: 'plain text', translation: '', romanization: '' }), { lines: [], plain: ['plain text'] });
});
test('lyric identity follows saved local bindings and physical disc scope without cross-disc guessing', () => {
  const context = { title: 'fixture', revision: 1, tracks, albums, media, links: [], bindings: [] };
  const before = JSON.stringify(context);
  assert.equal(linkedLyricSong(context, trackNumberAt(tracks, tracks.indexOf(cd[2]))), 3);
  assert.equal(linkedLyricSong(context, 1, null), null);
  const pages = discPages(tracks, '', media);
  assert.equal(linkedLyricSong(context, 3, pages[0].key), 3);
  assert.equal(linkedLyricSong(context, 1, pages[1].key), null);
  context.bindings = [{ discKey: pages[1].key, albumId: 100 }];
  assert.equal(linkedLyricSong(context, 1, pages[1].key), 1);
  context.links = [{ position: cd[0].position, title: cd[0].title, song: albums[0].album.tracks[4] }];
  assert.equal(linkedLyricSong(context, 1, pages[0].key), 5);
  assert.equal(linkedLyricSong(context, 999, pages[0].key), null);
  assert.equal(linkedLyricSong(context, 1, 'removed-disc'), null);
  assert.equal(JSON.stringify({ ...context, bindings: [], links: [] }), before);
});
