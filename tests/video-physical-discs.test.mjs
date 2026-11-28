import test from 'node:test';
import assert from 'node:assert/strict';
import { changeVideoMedia, videoDiscPages } from '../apps/desktop/src/video/physicalContents.ts';

const media = [{ carrierId: 'bd', label: '本编' }, { carrierId: 'bd', label: '特典一' }, { carrierId: 'cd', label: '原声' }];
const edition = { title: '影像', media };
const row = (title, disc_number) => ({ title, position: '1', duration: '', type_: 'track', disc_number });

test('physical discs include empty media and keep repeated numbers across formats separate', () => {
  const pages = videoDiscPages([row('访谈', 2), row('主题曲', 3)], edition);
  assert.deepEqual(pages.map(p => [p.name, p.tracks.map(t => t.title)]), [['本编', []], ['特典一', ['访谈']], ['原声', ['主题曲']]]);
});

test('removing an empty earlier disc keeps later contents and their credit references together', () => {
  const content = { tracks: [row('访谈', 2), row('主题曲', 3)], credits: [{ tracks: 'Disc 3 / 1' }] };
  const next = changeVideoMedia(content, edition, media.slice(1), 1);
  assert.deepEqual(next.tracks.map(t => t.disc_number), [1, 2]);
  assert.equal(next.credits[0].tracks, 'Disc 2 / 1');
  assert.equal(content.tracks[1].disc_number, 3);
});
