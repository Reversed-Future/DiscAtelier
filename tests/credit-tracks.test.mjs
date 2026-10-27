import test from 'node:test';
import assert from 'node:assert/strict';
import {creditTrackOptions, creditSelection, changeContentTracks, tracksWithCredits} from '../apps/desktop/src/metadata/creditTracks.ts';
import {updateTrackRows, assignTrackDisc, removeTrackRows} from '../apps/desktop/src/forms/contentTracks.ts';
const media=[{carrierId:'cd',label:''},{carrierId:'dvd',label:''}];
const tracks=[1,2].flatMap(disc_number=>[1,2].map(n=>({title:`Disc ${disc_number} track ${n}`,position:String(n),duration:'',type_:'track',disc_number,sub_tracks:[],extraartists:[]})));
const content=()=>({genres:[],styles:[],notes:'',companies:[],detailsLoaded:true,tracks:structuredClone(tracks),credits:[{name:'Name',anv:'',role:'Role',tracks:'Disc 2 / 1, Disc 2 / 2'}]});
test('same original positions on different discs have independent credit references',()=>{
 const options=creditTrackOptions(tracks,'Album',media);
 assert.equal(new Set(options.map(x=>x.id)).size,4);
 const selection=creditSelection('Disc 2 / 1, Disc 2 / 2',options);
 assert.deepEqual(options.filter(x=>selection.value.split(', ').includes(x.id)).map(x=>x.label),['Disc 2 · 1 · Disc 2 track 1','Disc 2 · 2 · Disc 2 track 2']);
 assert.deepEqual(creditSelection('1',options).options.filter(x=>x.id==='1').map(x=>x.label),['原曲号 1 · 请指定 Disc']);
 assert.equal(creditSelection('1',options.slice(0,2)).value,'Disc 1 / 1');
});
test('typing a track number keeps four options and moves the selected credit with that row',()=>{
 let value=content();const original=structuredClone(value);
 const keys=creditTrackOptions(value.tracks,'Album',media).map(x=>x.key);
 for(const position of ['', '2', '28', '2', '1']) {
  value=changeContentTracks(value,updateTrackRows(value.tracks,[2],{position}),'Album',media,true);
  const options=creditTrackOptions(value.tracks,'Album',media);
  assert.equal(options.length,4);assert.equal(new Set(options.map(x=>x.id)).size,4);
  assert.deepEqual(options.map(x=>x.key),keys);
  const selected=creditSelection(value.credits[0].tracks,options).value.split(', ');
  assert.deepEqual(options.filter(x=>selected.includes(x.id)).map(x=>x.source.title),['Disc 2 track 1','Disc 2 track 2']);
 }
 assert.deepEqual(value,original);
});
test('disc moves, insertions and removals preserve only the intended credit links',()=>{
 let value=content();
 value=changeContentTracks(value,assignTrackDisc(value.tracks,[2],1),'Album',media,true);
 let options=creditTrackOptions(value.tracks,'Album',media);
 assert.equal(creditSelection(value.credits[0].tracks,options).options.length,4);
 value=changeContentTracks(value,[{title:'Section',position:'',type_:'heading',heading_kind:'section',disc_number:1},...value.tracks],'Album',media);
 value=changeContentTracks(value,removeTrackRows(value.tracks,[3]),'Album',media);
 assert.equal(value.credits[0].tracks,'Disc 2 / 2');
});

test('scoped credits render on Disc 2 only, without overwriting or duplicating track credits',()=>{
 const value=content();value.tracks[2].extraartists=[{name:'Name',anv:'',role:'Role',tracks:''}];
 const original=structuredClone(value);
 const rows=tracksWithCredits(value,'Album',media);
 assert.equal(rows[0].extraartists.length,0);assert.equal(rows[1].extraartists.length,0);
 assert.equal(rows[2].extraartists.length,1);assert.equal(rows[3].extraartists.length,1);
 assert.equal(rows[3].extraartists[0].name,'Name');assert.deepEqual(value,original);
});
