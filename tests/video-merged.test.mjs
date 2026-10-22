import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeEpisodes} from '../apps/desktop/src/video/mergedEpisodes.ts';
import {galleryPictures,mergedFacts,animationCharacters} from '../apps/desktop/src/video/mergedPresentation.ts';

const episode = (id,number,extra={}) => ({id,number:String(number),group:'显示名称',title:`译名 ${number}`,originalTitle:`原名 ${number}`,airDate:'',duration:'24 分钟',...extra});
const work = (source,externalId,chapters) => ({source,externalId,chapters});
const bg = rows => work('bangumi',7157,rows.map(r => ({episodeKind:0,...r})));
const tv = rows => work('tmdbTv',9,rows.map(r => ({seasonNumber:1,...r})));
test('one unified episode keeps Bangumi titles and TMDB summary/still without mutating snapshots',()=>{
  const a=bg([episode(1,1),episode(2,2)]),b=tv([episode(31,1,{title:'TMDB 译名',originalTitle:'TMDB 译名',summary:'剧情',imageUrl:'still'}),episode(32,2)]);
  const before=JSON.stringify([a,b]),groups=mergeEpisodes([b,a]);
  assert.equal(groups.length,1);assert.equal(groups[0].rows.length,2);
  assert.equal(groups[0].rows[0].originalTitle,'原名 1');assert.equal(groups[0].rows[0].summary,'剧情');assert.equal(groups[0].rows[0].imageUrl,'still');
  assert.deepEqual(groups[0].rows[0].sources,['Bangumi','TMDB']);assert.equal(JSON.stringify([a,b]),before);
});
test('equal episode numbers never merge special types, ambiguous seasons or conflicting air dates',()=>{
  const a=bg([episode(1,1)]);
  assert.equal(mergeEpisodes([a,tv([episode(31,1),episode(32,1,{seasonNumber:2})])]).length,3);
  assert.equal(mergeEpisodes([a,tv([episode(31,1,{seasonNumber:0})])]).length,2);
  assert.equal(mergeEpisodes([bg([episode(1,1,{episodeKind:1})]),tv([episode(31,1)])]).length,2);
  assert.equal(mergeEpisodes([bg([episode(1,1,{airDate:'2010-10-04'})]),tv([episode(31,1,{airDate:'2020-10-04'})])]).length,2);
});
test('exact dates resolve multiple seasons, partial sets preserve unmatched episodes',()=>{
  const a=bg([episode(1,1,{airDate:'2010-10-04'})]),b=tv([episode(31,1,{airDate:'2010-10-04'}),episode(32,2),episode(33,1,{seasonNumber:2,airDate:'2020-10-04'})]);
  const groups=mergeEpisodes([a,b]);assert.equal(groups.length,2);assert.equal(groups[0].rows.length,2);assert.deepEqual(groups[0].rows[1].sources,['TMDB']);
});
test('legacy rows, duplicate numbers and multiple same-size linked works stay lossless',()=>{
  assert.equal(mergeEpisodes([work('bangumi',1,[episode(1,1)]),tv([episode(2,1)])]).length,2);
  assert.equal(mergeEpisodes([bg([episode(1,1),episode(2,1)]),tv([episode(3,1)])]).flatMap(g=>g.rows).length,3);
  const a=bg([episode(1,1)]),b={...bg([episode(2,1)]),externalId:2};
  assert.equal(mergeEpisodes([a,b,tv([episode(3,1)])]).length,3);
});
test('gallery combines all sources, exact shared URLs keep both attributions',()=>{
  const result=galleryPictures([{source:'bangumi',posterUrl:'cover',chapters:[]},{source:'tmdbTv',posterUrl:'cover',images:[{kind:'backdrop',url:'still',previewUrl:'small',width:100,height:60,language:''}],chapters:[episode(1,1,{imageUrl:'episode'})]}]);
  assert.equal(result.length,3);assert.deepEqual(result[0].sources,['Bangumi','TMDB']);assert.deepEqual(result.map(r=>r.kind),['poster','backdrop','episode']);
});
test('facts merge by explicit label, animated characters exclude stored actor photos',()=>{
  const fact={label:'原作',values:[{text:'Sphere',url:'https://bgm.tv/person/7405'}]};
  const works=[{source:'bangumi',facts:[fact,{label:'中文名',values:[{text:'缘之空',url:''}]}],characters:[{name:'春日野穹',portraitUrl:'animation'}]}, {source:'tmdbTv',facts:[fact],characters:[{name:'春日野穹',portraitUrl:'actor'}]}];
  assert.deepEqual(mergedFacts(works),[fact]);assert.deepEqual(animationCharacters(works),works[0].characters);
});
test('reported legacy episode merges offline by exact number, translated title and date, despite duration difference',()=>{
  const a=work('bangumi',7157,[episode(52323,1,{group:'本篇',title:'悠远的记忆',originalTitle:'ハルカナキオク',airDate:'2010-10-04',duration:'00:26:00'})]);
  const b=work('tmdbTv',9,[episode(31,1,{group:'第 1 季',title:'悠远的记忆',originalTitle:'悠远的记忆',airDate:'2010-10-04',duration:'25 分钟',summary:'已保存的单集简介',imageUrl:'saved-still'})]);
  const before=JSON.stringify([a,b]), merged=mergeEpisodes([a,b]);
  assert.equal(merged.length,1);assert.equal(merged[0].rows.length,1);
  assert.equal(merged[0].rows[0].originalTitle,'ハルカナキオク');assert.equal(merged[0].rows[0].summary,'已保存的单集简介');assert.equal(merged[0].rows[0].imageUrl,'saved-still');
  assert.deepEqual(merged[0].rows[0].sources,['Bangumi','TMDB']);assert.equal(JSON.stringify([a,b]),before);
});
test('a different episode date cannot block an individually proven match',()=>{
  const a=bg([episode(1,1,{airDate:'2010-10-04'}),episode(2,2,{airDate:'2010-10-11'})]);
  const b=tv([episode(31,1,{airDate:'2010-10-04',summary:'第一集'}),episode(32,2,{airDate:'2010-10-12'})]);
  const rows=mergeEpisodes([a,b]).flatMap(g=>g.rows);
  assert.equal(rows.length,3);assert.equal(rows[0].summary,'第一集');assert.deepEqual(rows[0].sources,['Bangumi','TMDB']);
});
test('legacy date matching rejects ambiguity, missing evidence and explicitly incompatible kinds',()=>{
  const a=work('bangumi',7157,[episode(1,1,{airDate:'2010-10-04'})]);
  const b=work('tmdbTv',9,[episode(31,1,{airDate:'2010-10-04'}),episode(32,1,{group:'另一季',airDate:'2010-10-04'})]);
  assert.equal(mergeEpisodes([a,b]).flatMap(g=>g.rows).length,3);
  assert.equal(mergeEpisodes([a,tv([episode(31,1,{title:'不同译法',originalTitle:'不同译法',airDate:'2010-10-04'})])]).length,1);
  assert.equal(mergeEpisodes([a,tv([episode(31,1,{airDate:'2010-10-04',seasonNumber:0})])]).length,2);
  assert.equal(mergeEpisodes([bg([episode(1,1,{airDate:'2010-10-04',episodeKind:1})]),tv([episode(31,1,{airDate:'2010-10-04'})])]).length,2);
});
test('alternate Chinese translations merge by episode and date without a synonym list or network',()=>{
  const a=work('bangumi',7157,[episode(52324,2,{group:'本篇',title:'难为情',originalTitle:'アキラハズカシ',airDate:'2010-10-11',duration:'00:26:00'})]);
  const b=work('tmdbTv',9,[episode(32,2,{group:'第 1 季',title:'害羞',originalTitle:'害羞',airDate:'2010-10-11',duration:'25 分钟',summary:'第二集简介',imageUrl:'second-still'})]);
  const before=JSON.stringify([a,b]), groups=mergeEpisodes([a,b]);
  assert.equal(groups.length,1);assert.equal(groups[0].rows.length,1);
  assert.equal(groups[0].rows[0].originalTitle,'アキラハズカシ');assert.equal(groups[0].rows[0].title,'难为情');
  assert.equal(groups[0].rows[0].summary,'第二集简介');assert.equal(groups[0].rows[0].imageUrl,'second-still');
  assert.deepEqual(groups[0].rows[0].sources,['Bangumi','TMDB']);assert.equal(JSON.stringify([a,b]),before);
});
test('similar titles alone cannot override episode numbers, dates or unknown dates',()=>{
  const a=work('bangumi',7157,[episode(1,2,{title:'难为情',airDate:'2010-10-11'})]);
  for (const row of [episode(31,3,{title:'害羞',airDate:'2010-10-11'}),episode(31,2,{title:'害羞',airDate:'2010-10-18'}),episode(31,2,{title:'害羞',airDate:''})]) {
    assert.equal(mergeEpisodes([a,work('tmdbTv',9,[row])]).flatMap(g=>g.rows).length,2);
  }
});
test('different translations cannot pick an arbitrary season sharing the same number and date',()=>{
  const a=work('bangumi',7157,[episode(1,2,{title:'难为情',originalTitle:'アキラハズカシ',airDate:'2010-10-11'})]);
  const b=tv([episode(31,2,{title:'害羞',originalTitle:'害羞',airDate:'2010-10-11'}),episode(32,2,{title:'羞涩',originalTitle:'羞涩',seasonNumber:2,airDate:'2010-10-11'})]);
  assert.equal(mergeEpisodes([a,b]).flatMap(g=>g.rows).length,3);
});
test('titles can disambiguate equal dates but pairing must agree in both directions',()=>{
  const a=work('bangumi',7157,[episode(1,2,{title:'害羞',originalTitle:'原名',airDate:'2010-10-11'})]);
  const second=work('bangumi',7158,[episode(2,2,{title:'另一标题',originalTitle:'另一原名',airDate:'2010-10-11'})]);
  const b=work('tmdbTv',9,[episode(31,2,{title:'害羞',originalTitle:'害羞',airDate:'2010-10-11'})]);
  const rows=mergeEpisodes([a,second,b]).flatMap(g=>g.rows);
  assert.equal(rows.length,2);assert.deepEqual(rows[0].sources,['Bangumi','TMDB']);assert.deepEqual(rows[1].sources,['Bangumi']);
});
