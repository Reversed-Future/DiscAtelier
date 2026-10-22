import test from 'node:test';
import assert from 'node:assert/strict';
import { putVideoWork, removeVideoWork, primaryVideoWork, videoWorks, workKey } from '../apps/desktop/src/video/sources.ts';

const work = (source, externalId, summary) => ({source, externalId, title:'同名作品', originalTitle:'Same work', summary, chapters:[{id:externalId, summary:'分集简介', imageUrl:'https://image.tmdb.org/t/p/w500/still.jpg'}], images:[{url:'https://image.tmdb.org/t/p/original/poster.jpg'}]});
const physical = {territory:'日本',releaseDate:'2011-01-01',volume:'第一卷',includedContent:'1–2',packaging:'初回版'};
test('adding TMDB retains Bangumi descriptions, episodes, pictures and physical details', () => {
  const bangumi = work('bangumi',7157,'原简介'), tmdb = work('tmdbTv',7157,'另一份简介');
  const old = {work:bangumi,physical}, merged = putVideoWork(old,tmdb);
  assert.deepEqual(videoWorks(merged),[bangumi,tmdb]);
  assert.equal(merged.work,bangumi);
  assert.equal(merged.physical,physical);
  assert.equal(old.additionalWorks,undefined);
  const refreshed = putVideoWork(merged,{...tmdb,summary:'更新 TMDB 简介'});
  assert.equal(refreshed.work,bangumi);
  assert.equal(refreshed.additionalWorks.length,1);
  assert.equal(refreshed.additionalWorks[0].summary,'更新 TMDB 简介');
  assert.deepEqual(refreshed.additionalWorks[0].chapters,tmdb.chapters);
  assert.deepEqual(refreshed.additionalWorks[0].images,tmdb.images);
});
test('changing title source or removing one source keeps the other snapshots', () => {
  const a=work('bangumi',1,'A'),b=work('tmdbTv',2,'B'),c=work('tmdbMovie',2,'C');
  const data={work:a,additionalWorks:[b,c],physical};
  assert.deepEqual(videoWorks(primaryVideoWork(data,workKey(b))),[b,a,c]);
  assert.deepEqual(videoWorks(removeVideoWork(data,workKey(a))),[b,c]);
  assert.deepEqual(videoWorks(removeVideoWork(data,workKey(b))),[a,c]);
  assert.equal(primaryVideoWork(data,'missing'),data);
  assert.deepEqual(videoWorks({work:null,physical}),[]);
});
test('source identity never uses a title and bounded collections still allow refresh', () => {
  let value={work:null,physical};
  for(let id=1;id<=8;id++) value=putVideoWork(value,work('tmdbTv',id,'same'));
  assert.equal(videoWorks(value).length,8);
  assert.throws(()=>putVideoWork(value,work('tmdbTv',9,'same')),/8/);
  assert.equal(putVideoWork(value,work('tmdbTv',1,'refreshed')).work.summary,'refreshed');
});
