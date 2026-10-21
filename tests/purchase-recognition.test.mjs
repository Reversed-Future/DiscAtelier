import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFields, fieldText, currentText } from '../apps/desktop/src/forms/purchase/recognition.ts';
const copy = () => ({ status: 'wanted', acquiredAt: '2020-01-01', amountMinor: 12000, currency: 'CNY', seller: '原店铺', purchaseUrl: '', storageLocation: '书架', notes: '保留备注' });
const fields = [
  { key: 'price', value: '2000', currency: 'JPY', evidence: '2000円' },
  { key: 'seller', value: '新店铺', currency: null, evidence: '新店铺' },
];
test('screenshot suggestions apply only selected fields and do not mutate the source copy', () => {
  const original = copy();
  const next = applyFields(original, '120.00', fields, ['seller']);
  assert.equal(next.copy.seller, '新店铺');
  assert.equal(next.amount, '120.00');
  assert.equal(next.copy.currency, 'CNY');
  assert.equal(next.copy.acquiredAt, '2020-01-01');
  assert.equal(next.copy.notes, '保留备注');
  assert.equal(next.copy.storageLocation, '书架');
  assert.deepEqual(original, copy());
});
test('price and currency change atomically and empty selection preserves the draft', () => {
  const next = applyFields(copy(), '120.00', fields, ['price']);
  assert.equal(next.amount, '2000'); assert.equal(next.copy.currency, 'JPY');
  assert.equal(next.copy.seller, '原店铺');
  assert.deepEqual(applyFields(copy(), '120.00', fields, []), { copy: copy(), amount: '120.00' });
  assert.deepEqual(applyFields(copy(), '120.00', [{ ...fields[0], currency: null }], ['price']), { copy: copy(), amount: '120.00' });
});
test('review displays old and recognized values without confusing currency or status', () => {
  assert.equal(fieldText(fields[0]), 'JPY 2000');
  assert.equal(currentText('price', copy(), '120.00'), 'CNY 120.00');
  assert.equal(currentText('status', copy(), ''), '想购入');
  assert.equal(currentText('purchaseUrl', copy(), ''), '未填写');
});
