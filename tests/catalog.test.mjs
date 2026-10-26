import test from 'node:test';
import assert from 'node:assert/strict';
import { dateValue, readDate, monthDays, moveMonth, localDate } from '../apps/desktop/src/ui/calendar.ts';
import { mediumLabel } from '../apps/desktop/src/library/mediumLabel.ts';
import { discPages } from '../apps/desktop/src/metadata/discTracks.ts';
import { physicalDiscCount, releaseDiscCount } from '../apps/desktop/src/metadata/discStructure.ts';
import { readFileSync } from 'node:fs';
import { assignTrackDisc } from '../apps/desktop/src/forms/contentTracks.ts';

test('manual assignment preserves original order within a physical disc', () => {
  const rows = [{ title: 'first', position: 'CD-1' }, { title: 'second', position: 'CD-2', disc_number: 1 }, { title: 'third', position: 'CD-3' }];
  const pages = discPages(rows, 'Album', [{ carrierId: 'cd', label: 'CD' }]);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].tracks.map(row => row.title), ['first', 'second', 'third']);
  assert.deepEqual(pages[0].entries.map(row => row.path), [[0], [1], [2]]);
});

test('moving a section changes ownership without rewriting positions or following sections', () => {
  const rows = [{ title: 'Bonus', type_: 'heading', heading_kind: 'section', position: '' }, { title: 'Song', position: 'original-42' }, { title: 'Next', type_: 'heading', position: '' }];
  const moved = assignTrackDisc(rows, [0], 2);
  assert.deepEqual(moved.map(row => row.disc_number), [2, 2, undefined]);
  assert.deepEqual(moved.map(row => row.position), rows.map(row => row.position));
  assert.equal(rows[1].disc_number, undefined);
});

for (const fixture of JSON.parse(readFileSync(new URL('./fixtures/disc-structure.json', import.meta.url), 'utf8'))) {
  test(`disc source structure: ${fixture.name}`, () => {
    const before = JSON.stringify(fixture.tracks);
    const pages = discPages(fixture.tracks, 'Fixture', fixture.media ?? fixture.discCount);
    assert.deepEqual(pages.map(page => page.key), fixture.keys);
    if (fixture.numbers) assert.deepEqual(pages.map(page => page.number), fixture.numbers);
    const leaves = rows => rows.flatMap(row => row.sub_tracks?.length ? leaves(row.sub_tracks) : row.type_ === 'heading' ? [] : [row]);
    assert.deepEqual(pages.flatMap(page => leaves(page.tracks)), leaves(fixture.tracks));
    assert.equal(JSON.stringify(fixture.tracks), before);
  });
}
test('physical media counts exclude vinyl sides and preserve Discogs quantities', () => {
  assert.equal(physicalDiscCount([{ carrierId: 'cd' }, { carrierId: 'bd' }, { carrierId: 'bd' }]), 3);
  assert.equal(physicalDiscCount([{ carrierId: 'vinyl' }, { carrierId: 'vinyl' }]), 0);
  assert.equal(releaseDiscCount([{ name: 'CD', qty: '1' }, { name: 'Blu-ray', qty: '2' }, { name: 'Box Set', qty: '1' }]), 3);
  assert.equal(releaseDiscCount([{ name: 'Unknown source format', qty: '2' }]), 0);
});

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

test('saved Pop Virus CD12 / BR1 rows split on read without rewriting source or track identities', () => {
  const live = '星野源　Live At Onkio Haus Studio';
  const source = [track('CD12', 'Family Song'), track('CD13', 'Nothing'), track('CD14', 'Hello Song'),
    heading(live), track('BR1', 'Night Troop'), track('BR2', '肌'), track('BR3', '桜の森'), track('BR4', 'Snow Men')];
  const saved = JSON.stringify(source);
  const restored = JSON.parse(saved);
  const pages = discPages(restored, 'Pop Virus');
  assert.deepEqual(pages.map(page => [page.key, page.name, page.numbered]), [['CD', 'Pop Virus', true], ['BR', live, true]]);
  assert.deepEqual(pages[0].tracks.map(row => row.position), ['CD12', 'CD13', 'CD14']);
  assert.deepEqual(pages[1].tracks.map(row => row.position), ['', 'BR1', 'BR2', 'BR3', 'BR4']);
  assert.deepEqual(pages.flatMap(page => page.tracks), source);
  assert.equal(JSON.stringify(restored), saved);
});

test('compact carrier grouping keeps nested tracks and does not interpret unrelated labels', () => {
  const pages = discPages([{ ...track('CD01'), type_: 'index', sub_tracks: [track('1.1'), track('1.2')] }, track('BR01'),
    ...['A1', 'B1', 'CD0', 'BR0', 'CD', 'BR', 'cd12', 'br1', 'BR1extra'].map(value => track(value))], 'Saved');
  assert.deepEqual(pages.map(page => page.key), ['CD', 'BR', 'unassigned']);
  assert.deepEqual(pages[0].tracks.map(row => row.position), ['CD01', '1.1', '1.2']);
});

test('Quintet CD and both Blu-ray discs are peers and preserve every source row', () => {
  const first = 'Morfonica Zepp Tour 2021「Amabile」東京公演';
  const second = 'Morfonica Concept Live「Resonance」';
  const source = [heading('CD'), track('CD-1'), heading(first), track('BD1-13'), track('BD1-14'), track('BD1-15'), heading(second), track('BD2-1'), track('BD2-2'), track('BD2-3'), track('BD2-4')];
  const before = structuredClone(source);
  const pages = discPages(source, 'Quintet');
  assert.deepEqual(pages.map(page => [page.key, page.name, page.numbered]), [['CD', 'CD', true], ['BD1', first, true], ['BD2', second, true]]);
  assert.deepEqual(pages[2].tracks.map(row => row.position), ['', 'BD2-1', 'BD2-2', 'BD2-3', 'BD2-4']);
  assert.deepEqual(pages.flatMap(page => page.tracks), source);
  assert.deepEqual(source, before);
});

test('nested Blu-ray index headings keep BD1 and BD2 on the same level', () => {
  const pages = discPages([track('CD-1'),
    { ...heading('BD one'), type_: 'index', sub_tracks: [track('BD1-1'), track('BD1-2')] },
    { ...heading('BD two'), type_: 'index', sub_tracks: [track('BD2-1')] },
  ], 'Quintet');
  assert.deepEqual(pages.map(page => [page.key, page.name]), [['CD', 'Quintet'], ['BD1', 'BD one'], ['BD2', 'BD two']]);
});
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
