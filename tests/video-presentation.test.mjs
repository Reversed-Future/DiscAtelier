import test from 'node:test';
import assert from 'node:assert/strict';
import { workTitles } from '../apps/desktop/src/video/titles.ts';
import { portraitCover } from '../apps/desktop/src/library/coverShape.ts';
test('video title uses original name with translation and preserves saved physical title', () => {
  const work = { originalTitle:'ヨスガノソラ', title:'缘之空' };
  assert.deepEqual(workTitles(work,'初回盘',''), {title:'ヨスガノソラ',subtitle:'缘之空'});
  assert.equal(work.title,'缘之空');
  assert.deepEqual(workTitles({originalTitle:'Same',title:'Same'}), {title:'Same',subtitle:''});
  assert.deepEqual(workTitles({originalTitle:'',title:'译名'}), {title:'译名',subtitle:''});
  assert.deepEqual(workTitles(null,'实体卷名','作者'), {title:'实体卷名',subtitle:'作者'});
});
test('video cases use portrait presentation without changing music CD/DVD shape', () => {
  assert.equal(portraitCover({categoryId:'video',media:[{carrierId:'bd'}]}),true);
  assert.equal(portraitCover({categoryId:'video',media:[{carrierId:'dvd'}]}),true);
  assert.equal(portraitCover({categoryId:'music',media:[{carrierId:'cd'},{carrierId:'dvd'}]}),false);
});
