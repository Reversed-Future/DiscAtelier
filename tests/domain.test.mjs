import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, totals, selectItems, createDemoItem } from '../prototype/domain.js';

const owned = { id: 'demo-owned', category: 'music', title: '示例', creator: '作者', status: 'owned', currency: 'CNY', amountMinor: 1990 };
test('整数金额保留精度、未知与零不同，拒绝不合法金额', () => {
  assert.equal(parseAmount('19.90', 'CNY'), 1990);
  assert.equal(parseAmount('', 'CNY'), null);
  assert.equal(parseAmount('0', 'CNY'), 0);
  assert.equal(parseAmount('100', 'JPY'), 100);
  for (const value of ['-1', '1e3', '0.001', 'NaN']) assert.throws(() => parseAmount(value, 'CNY'));
  assert.throws(() => parseAmount('1.1', 'JPY'));
});
test('只汇总持有副本，币种独立，未知不记为免费', () => {
  const result = totals([owned, { ...owned, amountMinor: null }, { ...owned, currency: 'JPY', amountMinor: 1000 }, { ...owned, status: 'wanted', amountMinor: 999999 }]);
  assert.deepEqual(result, { count: 3, unknown: 1, amounts: { CNY: 1990, JPY: 1000 } });
});
test('分区、搜索和状态共同生效，不修改源数组', () => {
  const items = [owned, { ...owned, id: 'demo-other', title: '另一张', status: 'wanted' }];
  assert.equal(selectItems(items, { section: 'video' }).length, 0);
  assert.equal(selectItems(items, { section: 'wanted', query: '另一' })[0].id, 'demo-other');
  assert.equal(selectItems(items, { section: 'music', query: '示例', status: 'wanted' }).length, 0);
  selectItems(items, { section: 'music', sort: 'title' });
  assert.equal(items[0], owned);
});
test('手动输入不接受空标题和未知状态', () => {
  const input = { title: '测试', creator: '', category: 'video', status: 'owned', amount: '', currency: 'CNY', seller: '' };
  assert.equal(createDemoItem(input, 'demo').cover, null);
  assert.throws(() => createDemoItem({ ...input, title: ' ' }, 'demo'));
  assert.throws(() => createDemoItem({ ...input, status: 'invalid' }, 'demo'));
});
