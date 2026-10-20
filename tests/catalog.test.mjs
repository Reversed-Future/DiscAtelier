import test from 'node:test';
import assert from 'node:assert/strict';
import { dateValue, readDate, monthDays, moveMonth, localDate } from '../apps/desktop/src/ui/calendar.ts';
import { mediumLabel } from '../apps/desktop/src/library/mediumLabel.ts';
import { discPages } from '../apps/desktop/src/metadata/discTracks.ts';

test('calendar validates real dates and retains local calendar values', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-12-31', '0099-01-02']) {
    assert.equal(dateValue(readDate(value)), value);
  }
  for (const value of ['', '2023-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '2026-1-2', '0000-01-01']) {
    assert.equal(readDate(value), null);
  }
});

test('calendar keeps six weeks and clamps month navigation without skipping February', () => {
  const days = monthDays(readDate('2026-02-15'));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(dateValue(days[0]), '2026-01-26');
  assert.equal(dateValue(days[41]), '2026-03-08');
  assert.equal(dateValue(moveMonth(readDate('2024-01-31'), 1)), '2024-02-29');
  assert.equal(dateValue(moveMonth(readDate('2026-01-31'), 1)), '2026-02-28');
  assert.equal(dateValue(moveMonth(readDate('2026-01-31'), -1)), '2025-12-31');
  assert.equal(dateValue(localDate(2026, 11, 32)), '2027-01-01');
});

test('carrier text removes only the repeated registered prefix and never mutates data', () => {
  const carriers = [{ id: 'cd', label: 'CD' }, { id: 'bd', label: 'BD' }];
  for (const [label, expected] of [['CD · Album', 'CD · Album'], ['CD', 'CD'], ['', 'CD'], ['Album', 'CD · Album'],
    ['CDr · Album', 'CD · CDr · Album'], ['CD Concert', 'CD · CD Concert'], ['cd · Album', 'CD · cd · Album']]) {
    const medium = Object.freeze({ carrierId: 'cd', label });
    assert.equal(mediumLabel(medium, carriers), expected);
  }
  assert.equal(mediumLabel({ carrierId: 'plugin-carrier', label: 'Custom' }, carriers), 'plugin-carrier · Custom');
});

const track = (position, title = position) => ({ position, title, duration: '3:00', type_: 'track' });
const heading = title => ({ position: '', title, duration: '', type_: 'heading' });
test('release 14262376 CD-/DVD- positions split by medium and keep the DVD heading', () => {
  const source = [track('CD-1'), track('CD-15'), heading('Live tour final'), track('DVD-1'), track('DVD-14')];
  const pages = discPages(source, '人間開花');
  assert.deepEqual(pages.map(page => [page.key, page.name]), [['CD', '人間開花'], ['DVD', 'Live tour final']]);
  assert.deepEqual(pages[1].tracks.map(row => row.position), ['', 'DVD-1', 'DVD-14']);
  assert.equal(pages.flatMap(page => page.tracks).length, source.length);
});
test('numbered discs retain their section titles and all tracks, without splitting bonus headings', () => {
  const source = [heading('Album'), track('1-1'), heading('Bonus'), track('1-2'), heading('Live'), track('2-1')];
  const original = structuredClone(source);
  const pages = discPages(source, 'Release');
  assert.deepEqual(pages.map(page => [page.key, page.name]), [['1', 'Album'], ['2', 'Live']]);
  assert.deepEqual(pages[0].tracks.map(row => row.title), ['Album', '1-1', 'Bonus', '1-2']);
  assert.equal(pages.flatMap(page => page.tracks).length, source.length);
  assert.deepEqual(source, original);
});

test('CD/DVD numbering stays separate and unassigned tracks remain visible', () => {
  const pages = discPages([track('CD1-1'), track('CD1-2'), track('DVD1-1'), track('A1'), track('3.1')], 'Mixed');
  assert.deepEqual(pages.map(page => page.key), ['CD1', 'DVD1', 'unassigned']);
  assert.equal(pages[2].numbered, false);
  assert.deepEqual(pages[2].tracks.map(row => row.position), ['A1', '3.1']);
});

test('zero-padded track numbers group correctly and nested movements keep their explicit parent disc', () => {
  const pages = discPages([track('CD1-01'), track('CD1-02'), {
    position: 'CD2-01', type_: 'index', title: 'Suite', duration: '',
    sub_tracks: [track('1.1'), track('1.2')],
  }], 'Release');
  assert.deepEqual(pages.map(page => page.key), ['CD1', 'CD2']);
  assert.deepEqual(pages[1].tracks.map(row => row.title), ['Suite', '1.1', '1.2']);
});

test('nested index tracks survive preview grouping; side headings do not invent disc numbers', () => {
  const source = [{ position: '', title: 'Symphony', duration: '', type_: 'index', sub_tracks: [track('A1'), track('A2')] },
    heading('Side B'), track('B1'), heading('Notes')];
  const pages = discPages(source, 'Release');
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].tracks.map(row => row.title), ['Symphony', 'A1', 'A2', 'Side B', 'B1', 'Notes']);
  assert.equal(source[0].type_, 'index');
  assert.deepEqual(discPages([], 'Empty'), []);
});
