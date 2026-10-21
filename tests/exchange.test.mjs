import test from 'node:test';
import assert from 'node:assert/strict';
import { convertAmounts, rateRatio } from '../apps/desktop/src/exchange/conversion.ts';

const status = (rates=[],target='CNY') => ({ settings:{enabled:true,developerId:'',target},hasKey:true,rates,today:'2026-10-22',attemptDate:'2026-10-22',lastAttemptAt:1,error:'' });
const rate = (from,value,to='CNY',fetchedDate='2026-10-22') => ({from,to,rate:value,updatedAt:'2026-10-21 08:00:02',fetchedDate});

test('JPY uses whole yen, other currencies use cents, and the full API rate is preserved', () => {
  const actual=status([rate('JPY','0.042290632517137'),rate('HKD','0.85257953951811')]);
  assert.equal(convertAmounts({JPY:'930'},actual).amount,'3933');
  assert.equal(convertAmounts({HKD:'10000'},actual).amount,'8526');
  assert.equal(convertAmounts({CNY:'100'},status([rate('CNY','23.646','JPY')],'JPY')).amount,'24');
  assert.equal(convertAmounts({CNY:'0'},actual).amount,'0');
  assert.deepEqual(convertAmounts({JPY:'930'},actual).dates,['2026-10-21']);
});
test('mixed totals round once and never silently omit a missing currency', () => {
  const s=status([rate('JPY','0.005'),rate('HKD','0.5')]);
  assert.equal(convertAmounts({JPY:'1'},s).amount,'1');
  assert.equal(convertAmounts({HKD:'1'},s).amount,'1');
  assert.equal(convertAmounts({JPY:'1',HKD:'1'},s).amount,'1');
  assert.equal(convertAmounts({JPY:'1',HKD:'1'},status([rate('JPY','0.005')])),null);
  assert.equal(convertAmounts({CNY:'123',HKD:'0'},status()).amount,'123');
});
test('large amounts and decimal exponent rates do not pass through floating point multiplication', () => {
  assert.equal(convertAmounts({HKD:'900719925474099300'},status([rate('HKD','1')])).amount,'900719925474099300');
  assert.deepEqual(rateRatio('1.25e-3'),[125n,100000n]);
  assert.deepEqual(rateRatio('2E+2'),[200n,1n]);
  for(const value of ['0','-1','NaN','Infinity','1e9999','0x10',' 1','1x']) assert.equal(rateRatio(value),null);
});
test('old cache is labelled, wrong target rates and unsupported currencies are rejected', () => {
  const s=status([rate('JPY','0.1','CNY','2026-10-21')]);
  assert.equal(convertAmounts({JPY:'100'},s).stale,true);
  assert.equal(convertAmounts({JPY:'100'},status([rate('JPY','0.1','HKD')])),null);
  for(const amounts of [{USD:'1'},{JPY:'1.5'},{CNY:'-1'},{JPY:'no'}]) assert.equal(convertAmounts(amounts,s),null);
});
