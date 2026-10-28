import { rateRatio } from './conversion.ts';
import type { Quote } from './gateway';

/** Compose only actual saved quotes, including their inverse. Round once at the end. */
export function calculateExchange(amount: string, from: string, to: string, rates: Quote[]) {
  const digits = /^(\d{1,24})(?:\.(\d{1,6}))?$/.exec(amount.trim());
  if (!digits) return null;
  const queue = [{ currency: from, top: 1n, bottom: 1n, quotes: [] as Quote[] }];
  const visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!;
    if (path.currency === to) {
      const fraction = digits[2] || '', places = to === 'JPY' ? 0 : 2;
      const top = BigInt(digits[1] + fraction) * path.top * 10n ** BigInt(places);
      const bottom = 10n ** BigInt(fraction.length) * path.bottom;
      const rounded = ((top * 2n + bottom) / (2n * bottom)).toString().padStart(places + 1, '0');
      return { amount: places ? `${rounded.slice(0, -places)}.${rounded.slice(-places)}` : rounded, quotes: path.quotes };
    }
    for (const quote of rates) {
      const ratio = rateRatio(quote.rate);
      if (!ratio) continue;
      const forward = quote.from === path.currency, backward = quote.to === path.currency;
      if (!forward && !backward) continue;
      const currency = forward ? quote.to : quote.from;
      if (visited.has(currency)) continue;
      visited.add(currency);
      queue.push({ currency, top: path.top * ratio[forward ? 0 : 1], bottom: path.bottom * ratio[forward ? 1 : 0], quotes: [...path.quotes, quote] });
    }
  }
  return null;
}
