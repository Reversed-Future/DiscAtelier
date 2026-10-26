// Screenshot titles with synthetic same-name live rows, to isolate cross-disc ambiguity.
const titles = [
  ['Daylight -デイライト-', 'Daylight –デイライト–', 350],
  ['メランコリックララバイ', 'メランコリックララバイ', 216],
  ['Flame Of Hope', 'flame of hope', 252],
  ['ブルームブルーム', 'ブルームブルーム', 276],
  ['カラフルリバティー', 'カラフルリバティー', 218],
  ['Fly With The Night', 'fly with the night', 240],
  ['金色へのプレリュード', '金色へのプレリュード', 271],
];
export const media = [{ carrierId: 'cd', label: 'CD' }, { carrierId: 'bd', label: 'BD' }, { carrierId: 'bd', label: 'BD' }];
export const cd = titles.map(([title], index) => ({ title, position: `CD-${index + 1}`, duration: '', type_: 'track' }));
const heading = title => ({ title, position: '', duration: '', type_: 'heading' });
export const tracks = [heading('CD'), ...cd, heading('Live one'),
  ...[0, 2, 3, 5, 6].map((index, at) => ({ ...cd[index], position: `BD1-${at + 1}` })),
  heading('Live two'), { ...cd[5], position: 'BD2-1' }];
export const album = { albumId: 100, title: 'Quintet', artists: ['Morfonica'], description: '', company: '', publishedAt: 0, links: [],
  tracks: titles.map(([, title, seconds], index) => ({ id: index + 1, title, disc: '1', number: index + 1, durationMs: seconds * 1000, artists: ['Morfonica'] })) };
export const albums = [{ album, legacyPositions: false }];
