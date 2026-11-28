import { useEffect, useSyncExternalStore } from 'react';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { exchange, type YenPurchaseRate } from './gateway';

interface Entry { rate?: YenPurchaseRate; error?: string; retryAt?: number }
let entries: ReadonlyMap<string, Entry> = new Map();
const listeners = new Set<() => void>();
const consumers = new Map<string, number>();
const queue = new Set<string>(), pending = new Set<string>();
let generation = 0;

function publish(date: string, entry: Entry) {
  entries = new Map(entries).set(date, entry);
  listeners.forEach(listener => listener());
}

function drain() {
  while (pending.size < 2 && queue.size) {
    const date = queue.values().next().value!;
    queue.delete(date);
    if (!consumers.has(date) || pending.has(date)) continue;
    const started = generation;
    pending.add(date);
    void exchange.purchaseRate(date).then(rate => {
      if (started === generation) publish(date, { rate });
    }, cause => {
      if (started === generation) publish(date, { error: errorMessage(cause), retryAt: Date.now() + 300_000 });
    }).finally(() => {
      pending.delete(date);
      if (started !== generation && consumers.has(date)) queue.add(date);
      drain();
    });
  }
}

function schedule(date: string, force = false) {
  const entry = entries.get(date);
  if (!entry?.rate && !pending.has(date) && (force || (entry?.retryAt || 0) <= Date.now())) queue.add(date);
}
function retry() {
  consumers.forEach((_, date) => schedule(date));
  drain();
}
function online() {
  consumers.forEach((_, date) => schedule(date, true));
  drain();
}
let timer: ReturnType<typeof setInterval>;
function subscribe(fn: () => void) {
  if (!listeners.size) {
    timer = setInterval(retry, 300_000);
    window.addEventListener('online', online);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { clearInterval(timer); window.removeEventListener('online', online); }
  };
}
const snapshot = () => entries;

export function resetPurchaseRates() {
  generation++;
  entries = new Map();
  listeners.forEach(fn => fn());
  retry();
}

export function usePurchaseRates(dates: string) {
  const values = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (!dates || !desktopAvailable()) return;
    const keys = dates.split('|');
    for (const key of keys) {
      consumers.set(key, (consumers.get(key) || 0) + 1);
      schedule(key);
    }
    drain();
    return () => {
      for (const key of keys) {
        const count = consumers.get(key)! - 1;
        if (count) consumers.set(key, count);
        else consumers.delete(key);
      }
    };
  }, [dates]);
  return values;
}
