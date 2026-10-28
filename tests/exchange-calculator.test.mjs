import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExchange } from '../apps/desktop/src/exchange/calculator.ts';
const rates = [
 {from:'JPY',to:'CNY',rate:'0.05',updatedAt:'2026-10-29',fetchedDate:'2026-10-29'},
 {from:'HKD',to:'CNY',rate:'0.9',updatedAt:'2026-10-28',fetchedDate:'2026-10-28'},
];
test('calculator uses direct, inverse and cross quotes, rounding only the final amount', () => {
 assert.equal(calculateExchange('100','JPY','CNY',rates).amount,'5.00');
 assert.equal(calculateExchange('5','CNY','JPY',rates).amount,'100');
 const cross=calculateExchange('100','JPY','HKD',rates);
 assert.equal(cross.amount,'5.56'); assert.equal(cross.quotes.length,2);
 assert.equal(cross.quotes[1].fetchedDate,'2026-10-28');
 assert.equal(calculateExchange('9007199254740993.12','CNY','CNY',[]).amount,'9007199254740993.12');
 assert.equal(calculateExchange('1.5','JPY','JPY',[]).amount,'2');
 assert.equal(calculateExchange('0','JPY','CNY',rates).amount,'0.00');
});
test('calculator does not invent absent rates or accept invalid amounts and zero rates', () => {
 assert.equal(calculateExchange('100','JPY','HKD',rates.slice(0,1)),null);
 for(const amount of ['','-3','NaN','1e3','1.1234567','1,000','0x10']) assert.equal(calculateExchange(amount,'JPY','CNY',rates),null);
 assert.equal(calculateExchange('100','JPY','CNY',[{...rates[0],rate:'0'}]),null);
});
