import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPackaging, currentPackaging } from '../apps/desktop/src/video/packaging.ts';
const edition = () => ({ categoryId:'video',title:'实体名称',creator:'',editionLabel:'初回版',barcode:'123',catalogNumber:'A-1',media:[{carrierId:'bd',label:'Disc 1'}] });
const metadata = () => ({work:{title:'作品名',episodeCount:12,summary:'作品简介'},physical:{territory:'',releaseDate:'',volume:'',includedContent:'第1–2集',packaging:''}});
test('packaging changes only confirmed physical fields and never work metadata',()=>{
 const e=edition(),m=metadata(),next=applyPackaging(e,m,[{key:'volume',value:'第1卷'}]);
 assert.equal(next.metadata.physical.volume,'第1卷');assert.deepEqual(next.metadata.work,m.work);assert.equal(next.metadata.physical.includedContent,'第1–2集');
 assert.deepEqual(e,edition());assert.deepEqual(m,metadata());assert.deepEqual(next.edition,e);
 assert.deepEqual(applyPackaging(e,m,[]),{edition:e,metadata:m});
});
test('disc count requires a separate carrier selection and preserves existing disc labels',()=>{
 const next=applyPackaging(edition(),metadata(),[{key:'discCount',value:'2'}]);assert.deepEqual(next.edition.media,[{carrierId:'bd',label:'Disc 1'},{carrierId:'',label:''}]);
 const both=applyPackaging(edition(),metadata(),[{key:'carrier',value:'dvd'},{key:'discCount',value:'2'}]);assert.equal(both.edition.media[0].label,'Disc 1');assert.equal(both.edition.media[1].carrierId,'dvd');
 assert.equal(currentPackaging(edition(),metadata(),'discCount'),'1');assert.equal(currentPackaging(edition(),metadata(),'includedContent'),'第1–2集');
});
