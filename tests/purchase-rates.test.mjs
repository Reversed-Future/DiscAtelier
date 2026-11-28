import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseTotal, yenAmount } from '../apps/desktop/src/exchange/purchaseAmounts.ts';

const status = { settings: { target: 'CNY' }, rates: [
  { from: 'JPY', to: 'CNY', rate: '3' },
  { from: 'HKD', to: 'CNY', rate: '0.9', fetchedDate: '2024-06-05', updatedAt: '2024-06-05' },
], today: '2024-06-05' };
const rates = new Map([
  ['2024-05-17', { rate: { cnyPerJpy: '0.046384', hkdPerJpy: '0.050071' } }],
  ['2024-04-17', { rate: { cnyPerJpy: '0.0475', hkdPerJpy: '0.051' } }],
]);
const jpy = (date, amount = 1000, state = 'owned') => ({
  copy: { currency: 'JPY', amountMinor: amount, status: state, acquiredAt: date },
});

test('sum of individually rounded yen purchases uses each purchase date and respects ownership', () => {
  const rows = [jpy('2024-05-17'), jpy('2024-04-17'), jpy('', 1000, 'transit'), jpy('', 1000, 'wanted')];
  const amounts = { JPY: '2000', CNY: '85', HKD: '100' };
  assert.deepEqual(purchaseTotal(amounts, rows, status, rates), { amount: '9563', stale: false });
  assert.equal(purchaseTotal(amounts, rows, { ...status, rates: status.rates.slice(1) }, rates).amount, '9563');
  assert.equal(yenAmount(1000, 'HKD', rates.get('2024-05-17').rate), 5007n);
  assert.equal(yenAmount(9000000000000, 'CNY', rates.get('2024-05-17').rate), 41745600000000n);
});
test('missing dates and unavailable rates never fall back to live or produce a partial total', () => {
  for (const date of ['', '2024-06-01']) {
    assert.equal(purchaseTotal({ JPY: '1000' }, [jpy(date)], status, rates), null);
  }
  assert.equal(yenAmount(0, 'CNY'), 0n);
  assert.equal(yenAmount(1200, 'JPY'), 1200n);
  assert.equal(purchaseTotal({ JPY: '0' }, [jpy('', 0)], status, rates).amount, '0');
});
