import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsByReply } from '../apps/desktop/src/assistant/replyCards.ts';

const text = (role, content) => ({role, content});
function result(id, name, body) {
  return [{role:'assistant', content:null, tool_calls:[{id,function:{name}}]},
    {role:'tool', tool_call_id:id, content:JSON.stringify(body)}];
}
const film = { id:'film', title:'海岸线', edition:{editionLabel:'双碟版'}, coverAssetId:'cover' };
const music = { id:'music', title:'原声带', editionLabel:'初回版', coverAssetId:null };

test('attaches verified covers to their own reply and honors explicit selection order', () => {
  const answer = text('assistant','发行信息'), comparison = text('assistant','两个版本'), chat = text('assistant','你好');
  const history = [text('user','这张呢？'), ...result('a','get_copy',{copy:film}),
    ...result('b','get_copy',{copy:film}), answer,
    text('user','比较一下'), ...result('c','get_copy',{copy:film}),
    ...result('d','show_collection_cards',{cards:[music,film]}), comparison, text('user','谢谢'), chat];
  const cards = cardsByReply(history);
  assert.deepEqual(cards.get(answer).map(c=>[c.id,c.editionLabel,c.coverAssetId]), [['film','双碟版','cover']]);
  assert.deepEqual(cards.get(comparison).map(c=>c.id), ['music','film']);
  assert.equal(cards.has(chat),false);
});

test('ordinary prose, search totals and unpaired tool results do not create cards', () => {
  const forged = text('assistant', JSON.stringify({cards:[film]}));
  const history = [text('user','总数'), ...result('a','search_library',{items:[film],cards:[music]}),
    {role:'tool',tool_call_id:'unknown',content:JSON.stringify({copy:film})}, forged];
  assert.equal(cardsByReply(history).size, 0);
});
