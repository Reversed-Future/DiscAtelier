import test from 'node:test';
import assert from 'node:assert/strict';
import { blurayPrograms, dvdProgram, cdProgram, importDisc } from '../apps/desktop/src/video/opticalDiscImport.ts';

const list = (playlist, durationSeconds, chapters) => ({playlist, durationSeconds, chapters});
const mark = (index, startSeconds, durationSeconds) => ({index, startSeconds, durationSeconds});
const row = (disc_number, title) => ({disc_number, title, position: '1', duration: '', type_: 'track'});
const edition = { title: '套装', media: [{carrierId:'bd',label:'本编'}, {carrierId:'bd',label:'特典'}] };
const source = {title:'原盘名', carrier:'bd', programs:blurayPrograms([
  list('00001.mpls', 90, [mark(1,0,60),mark(2,60,30)]),list('00002.mpls', 3, [])
])};

test('chapter marks, unmarked titles, leading footage and end marks use recorded times', () => {
  const [program, noMarks] = blurayPrograms([list('00000.mpls', 3, []),
    list('00001.mpls', 20, [mark(1,5,15),mark(2,20,0)])]);
  assert.deepEqual(program.entries.map(e => [e.title, e.duration]), [['首个章节标记之前',5],['第 1 章',15]]);
  assert.equal(noMarks.entries[0].duration, 3);
  assert.equal(dvdProgram(3,[mark(1,0,15.5)]).duration,15.5);
  assert.deepEqual(cdProgram([{number:2,durationSeconds:61}]).entries,[{position:'2',title:'音轨 2',duration:61}]);
});
test('replacement is limited to one disc, multiple programs stay grouped, repeats replace cleanly', () => {
  const content = {tracks:[row(1,'本编'),row(2,'旧章节')], credits:[{tracks:'Disc 1 / 1'}]};
  const result = importDisc(edition,content,2,source,'replace');
  assert.deepEqual(result.content.tracks.map(t=>t.title),['本编','00001.mpls','第 1 章','第 2 章','00002.mpls','00002.mpls']);
  assert.deepEqual(result.content.tracks.filter(t=>t.type_==='track').map(t=>t.duration),['','1:00','0:30','0:03']);
  assert.equal(result.content.credits[0].tracks,'Disc 1 / 1');
  assert.equal(result.edition.media[1].label,'原盘名');
  assert.deepEqual(content.tracks.map(t=>t.title),['本编','旧章节']);
  const repeat=importDisc(result.edition,result.content,2,source,'replace');
  assert.deepEqual(repeat.content.tracks.map(t=>t.title), result.content.tracks.map(t=>t.title));
});
test('append keeps hand-edited chapters and falls back to the existing label on an unnamed disc', () => {
  const content={tracks:[row(1,'本编'),row(2,'已编辑')],credits:[]};
  const result=importDisc(edition,content,2,{title:'',carrier:'cd',programs:[cdProgram([{number:1,durationSeconds:145}])]},'append');
  assert.deepEqual(result.edition.media[1], {carrierId:'cd',label:'特典'});
  assert.deepEqual(result.content.tracks.map(t=>t.title), ['本编','已编辑','音轨 1']);
  assert.equal(result.content.tracks.at(-1).duration,'2:25');
});
