import test from 'node:test';
import assert from 'node:assert/strict';
import { albumMatches, albumRows, trackLeaves } from '../apps/desktop/src/integrations/albumTracks.ts';
import { trackKey } from '../apps/desktop/src/integrations/trackMatches.ts';
import { collectionQueue } from '../apps/desktop/src/playback/collectionQueue.ts';
import { nextSong, rememberAlbum, parseHistory, emptyHistory } from '../apps/desktop/src/playback/musicQueue.ts';

const song = (id, title, number = 1) => ({ id, title, number, disc:'1', artists:['Artist'], durationMs:180000 });
const linked = (id, title, tracks, legacyPositions = false) => ({ album:{albumId:id,title,artists:['Artist'],description:`${title} introduction`,company:'Label',publishedAt:1,tracks,links:[]},legacyPositions });
const pm = linked(100,'PM',[song(11,'夜',1),song(12,'星',2)]);
const am = linked(200,'AM',[song(21,'晨',1),song(22,'光',2)]);
const row = (position,title) => ({position,title,duration:'3:00',type_:'track'});
const rows = [row('1-1','夜'),row('1-2','星'),row('2-1','晨'),row('2-2','光')];

test('physical order overrides digital album association order and excludes digital-only bonus tracks', () => {
  const extra = linked(200,'AM',[song(99,'Digital bonus'),...am.album.tracks]);
  const queue = collectionQueue('physical',12,[extra,pm],[],rows);
  assert.deepEqual(queue.tracks.map(t=>t.id),[11,12,21,22]);
  assert.equal(nextSong(queue,12,'list'),21);
  assert.equal(nextSong(queue,22,'list'),11);
  assert.equal(nextSong(queue,12,'one',1,true),12);
  assert.equal(queue.albumId,null);
  assert.equal(rememberAlbum([queue],{...queue,lastSongId:21}).length,1);
  assert.equal(parseHistory(JSON.stringify({...emptyHistory(),albums:[queue]})).albums.length,1);
  assert.equal(collectionQueue('physical',99,[extra,pm],[],rows),null);
});
test('each physical disc can explicitly choose a different album with identically named songs', () => {
  const first = linked(1,'PM',[song(31,'Opening')]);
  const second = linked(2,'AM',[song(41,'Opening')]);
  const tracks=[row('1-1','Opening'),row('2-1','Opening')];
  const bindings=[{discKey:'1',albumId:1},{discKey:'2',albumId:2}];
  const matches=albumMatches(tracks,[first,second],[],bindings);
  assert.equal(matches.get(trackKey(tracks[0])).id,31);
  assert.equal(matches.get(trackKey(tracks[1])).id,41);
  assert.deepEqual(collectionQueue('physical',31,[first,second],[],tracks,bindings).tracks.map(s=>s.id),[31,41]);
});
test('manual song links override disc scope; unavailable or mismatched scoped albums never fall back silently', () => {
  const bindings=[{discKey:'1',albumId:200},{discKey:'2',albumId:200}];
  assert.equal(albumMatches(rows,[pm,am],[],bindings).has(trackKey(rows[0])),false);
  const links=[{position:'1-1',title:'夜',song:song(42,'Independently linked')}];
  assert.equal(albumMatches(rows,[pm,am],links,bindings).get(trackKey(rows[0])).id,42);
  assert.equal(albumMatches(rows,[pm],[],[{discKey:'1',albumId:200}]).size,0);
});
test('ambiguous cross-album titles require a disc selection or explicit song link', () => {
  const a=linked(1,'PM',[song(31,'共享歌曲')]), b=linked(2,'AM',[song(41,'共享歌曲')]);
  assert.equal(albumMatches([row('1','共享歌曲')],[a,b],[]).size,0);
  assert.equal(albumMatches([row('1','共享歌曲')],[a,b],[],[{discKey:'unassigned',albumId:2}]).get(trackKey(row('1','共享歌曲'))).id,41);
  assert.equal(albumMatches([row('1','共享歌曲')],[linked(3,'简体',[song(51,'共享歌曲')])],[]).size,1);
});
test('without physical rows each digital album retains stable track identities across reordering', () => {
  const old={...pm,legacyPositions:true};
  const link={position:albumRows(am)[0].position,title:'晨',song:song(55,'Custom')};
  assert.equal(albumRows(old)[0].position,'1-1');
  assert.equal(albumRows(am)[0].position,'netease:200:1:1');
  assert.deepEqual(collectionQueue('physical',11,[old,am],[link],[]).tracks.map(s=>s.id),[11,12,55,22]);
  assert.deepEqual(collectionQueue('physical',11,[am,old],[link],[]).tracks.map(s=>s.id),[55,22,11,12]);
  assert.equal(collectionQueue('physical',55,[old],[],[]),null);
  assert.equal(pm.album.description,'PM introduction'); assert.equal(am.album.description,'AM introduction');
});
test('nested physical suites keep their actual leaf order and simplified matching works within a selected disc', () => {
  const tracks=[{...row('1-1','Suite'),type_:'index',sub_tracks:[row('','時光'),row('','後來')]}];
  const album=linked(1,'Digital',[song(2,'后来'),song(1,'时光')]);
  assert.equal(trackLeaves(tracks).length,2);
  assert.deepEqual(collectionQueue('physical',1,[album],[],tracks,[{discKey:'1',albumId:1}]).tracks.map(s=>s.id),[1,2]);
});
