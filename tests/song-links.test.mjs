import test from 'node:test';
import assert from 'node:assert/strict';
import { trackKey, trackMatches } from '../apps/desktop/src/integrations/trackMatches.ts';
import { linkedQueue } from '../apps/desktop/src/playback/linkedQueue.ts';
import { emptyHistory, rememberAlbum, parseHistory, nextSong } from '../apps/desktop/src/playback/musicQueue.ts';
const rows = [{position:'1',title:'Original',duration:'3:00',type_:'track'},{position:'2',title:'Second',duration:'3:00',type_:'track'}];
const song = (id,title) => ({id,title,artists:['Artist'],disc:'1',number:id,durationMs:180000});
const links = [{position:'1',title:'Original',song:song(42,'External')},{position:'2',title:'Second',song:song(43,'Other album')}];
const album = {albumId:100,title:'Album',artists:['Artist'],tracks:[song(1,'Original'),song(2,'Second')],links:[]};

test('individual links work without an album and override both legacy and automatic matches', () => {
  assert.equal(trackMatches(rows,null,links).get(trackKey(rows[0])).id,42);
  assert.equal(trackMatches(rows,album,links).get(trackKey(rows[0])).id,42);
  assert.equal(trackMatches(rows,{...album,links:[{position:'1',title:'Original',songId:1}]},links).get(trackKey(rows[0])).id,42);
  assert.equal(trackMatches(rows,null,[]).size,0);
  assert.equal(trackMatches(rows,album,[]).get(trackKey(rows[0])).id,1);
  assert.equal(trackMatches([{...rows[0],title:'Edited'}],null,links).size,0);
  assert.equal(trackMatches([rows[0],rows[0]],null,links).size,0);
});
test('standalone queues persist separately, loop and retain at most three collection histories', () => {
  const queue = linkedQueue('edition-one',42,null,links,rows);
  assert.equal(queue.albumId,null);
  assert.deepEqual(queue.tracks.map(t=>t.id),[42,43]);
  assert.equal(nextSong(queue,43,'list'),42);
  assert.equal(nextSong(queue,42,'one',1,true),42);
  const history = {...emptyHistory(),albums:[queue]};
  assert.deepEqual(parseHistory(JSON.stringify(history)),history);
  let saved=[];
  for(const editionId of ['a','b','c','d']) saved=rememberAlbum(saved,{...queue,editionId});
  assert.deepEqual(saved.map(q=>q.editionId),['d','c','b']);
});
test('linked songs replace old matches in the queue, and unlinked songs cannot be replayed from stale history', () => {
  assert.deepEqual(linkedQueue('edition',42,album,links,rows).tracks.map(t=>t.id),[42,43]);
  assert.equal(linkedQueue('edition',42,album,[],rows),null);
  assert.equal(linkedQueue('edition',42,null,links,[{...rows[0],title:'Edited'}]),null);
  const nested=[{title:'Suite',position:'',type_:'index',sub_tracks:rows}];
  assert.deepEqual(linkedQueue('edition',42,null,links,nested).tracks.map(t=>t.id),[42,43]);
  const swapped = [{...links[0],song:album.tracks[1]},{...links[1],song:album.tracks[0]}];
  assert.deepEqual(linkedQueue('edition',2,album,swapped,rows).tracks.map(t=>t.id),[2,1]);
});
