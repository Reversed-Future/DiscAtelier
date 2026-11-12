import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerEpisodes, currentEpisodeIndex, localEpisodeTitle, normalizePath, videoBindingsForCopy } from '../apps/desktop/src/playback/episodeGallery.ts';

const binding = (path, episode, label = '', copyId = 'copy-1') => ({ copyId, path, label, episode, track: null });
const chapter = (id, number, title, extra = {}) => ({
  id, number: String(number), title, originalTitle: title, group: `第 ${extra.seasonNumber || 1} 季`,
  airDate: '2026-01-01', duration: '24 分钟', ...extra,
});
const metadata = (chapters, images = [], posterUrl = '') => ({
  work: { source: 'tmdbTv', externalId: 7, title: '作品', originalTitle: '作品', posterUrl, images, chapters },
  physical: {},
});

test('video bindings keep only this copy, drop audio, dedupe and sort by episode', () => {
  const values = [
    binding('C:\\Show\\E02.mkv', 2),
    binding('C:\\Show\\E01.mkv', 1),
    binding('c:/show/e01.MKV', 1),
    binding('C:\\Show\\track.mp3', 3),
    binding('C:\\Other\\E04.mkv', 4, '', 'copy-2'),
    binding('C:\\Show\\bonus.mkv', null),
  ];
  const result = videoBindingsForCopy(values, 'copy-1');
  assert.deepEqual(result.map(row => row.path), ['C:\\Show\\E01.mkv', 'C:\\Show\\E02.mkv', 'C:\\Show\\bonus.mkv']);
});

test('saved labels resolve the season whose episode title they contain', () => {
  const rows = [
    chapter(11, 1, '第一季第一集', { seasonNumber: 1, imageUrl: 's1-still' }),
    chapter(21, 1, '第二季第一集', { seasonNumber: 2, imageUrl: 's2-still' }),
    chapter(22, 2, '第二季第二集', { seasonNumber: 2, imageUrl: 's2-still-2' }),
  ];
  const items = buildPlayerEpisodes(metadata(rows), [
    binding('C:\\Show\\S02E01.mkv', 1, '作品 · 第 1 章 · 第二季第一集'),
    binding('C:\\Show\\S02E02.mkv', 2, '作品 · 第 2 章 · 第二季第二集'),
  ], 'C:\\Show\\S02E01.mkv');
  assert.equal(items[0].title, '第二季第一集');
  assert.equal(items[0].stillUrl, 's2-still');
  assert.equal(items[1].title, '第二季第二集');
  assert.equal(items[0].badge, '01');
});

test('missing episode stills fall back to a backdrop, then the poster, then nothing', () => {
  const rows = [chapter(11, 1, '第一集', { seasonNumber: 1, imageUrl: '' })];
  const withBackdrop = metadata(rows, [{ kind: 'backdrop', url: 'backdrop-full', previewUrl: 'backdrop-small', width: 100, height: 60, language: '' }], 'poster');
  assert.equal(buildPlayerEpisodes(withBackdrop, [binding('C:\\Show\\E01.mkv', 1)], 'C:\\Show\\E01.mkv')[0].stillUrl, 'backdrop-small');
  const posterOnly = metadata(rows, [], 'poster');
  assert.equal(buildPlayerEpisodes(posterOnly, [binding('C:\\Show\\E01.mkv', 1)], 'C:\\Show\\E01.mkv')[0].stillUrl, 'poster');
  assert.equal(buildPlayerEpisodes(null, [binding('C:\\Show\\E01.mkv', 1)], 'C:\\Show\\E01.mkv')[0].stillUrl, '');
});

test('unmatched local files still get a usable title and index', () => {
  const value = binding('C:\\Show\\No.Metadata.E05.mkv', null, '作品 · 第 5 章 · 第五集');
  assert.equal(localEpisodeTitle(value), '第五集');
  const items = buildPlayerEpisodes(null, [value], 'C:\\Show\\No.Metadata.E05.mkv');
  assert.equal(items[0].title, '第五集');
  assert.equal(items[0].badge, '01');
  assert.equal(currentEpisodeIndex(items, 'c:/show/no.metadata.e05.MKV'), 0);
  assert.equal(normalizePath('C:\\Show\\E01.mkv'), 'c:/show/e01.mkv');
});
