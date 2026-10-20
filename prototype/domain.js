export const statuses = { owned: '已购入', wanted: '想购入', transit: '在途' };
export const currencies = { CNY: 2, HKD: 2, JPY: 0 };

export function parseAmount(value, currency) {
  if (!Object.hasOwn(currencies, currency)) throw Error('不支持的币种');
  if (value === '') return null;
  const digits = currencies[currency];
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(value)) throw Error(digits ? '价格最多保留两位小数' : '日元价格请填写整数');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(amount) || amount < 0) throw Error('价格超出范围');
  return amount;
}

export function formatAmount(value, currency) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: currencies[currency], maximumFractionDigits: currencies[currency] }).format(value / 10 ** currencies[currency]);
}

export function selectItems(items, { section, query = '', status = 'all', sort = 'original' }) {
  const selected = items.filter(item => {
    const sectionMatches = section === 'wanted' || section === 'transit' ? item.status === section : item.category === section;
    return sectionMatches && (status === 'all' || item.status === status) && (!query || [item.title, item.creator, item.seller].some(value => value?.includes(query)));
  });
  if (sort === 'title' || sort === 'creator') selected.sort((a, b) => a[sort].localeCompare(b[sort], 'zh-CN'));
  return selected;
}

export function totals(items) {
  const owned = items.filter(item => item.status === 'owned');
  const amounts = {};
  for (const item of owned) {
    if (item.amountMinor !== null) amounts[item.currency] = (amounts[item.currency] ?? 0) + item.amountMinor;
  }
  return { count: owned.length, amounts, unknown: owned.filter(item => item.amountMinor === null).length };
}

export function createDemoItem(input, id) {
  if (!input.title.trim()) throw Error('请填写名称');
  if (!['music', 'video'].includes(input.category) || !Object.hasOwn(statuses, input.status)) throw Error('分区或状态无效');
  return { id, title: input.title.trim(), creator: input.creator.trim(), category: input.category, status: input.status, amountMinor: parseAmount(input.amount.trim(), input.currency), currency: input.currency, seller: input.seller.trim(), cover: null, modelReference: null };
}
