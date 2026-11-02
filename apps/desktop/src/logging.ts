import { invoke, isTauri } from '@tauri-apps/api/core';

type LogLevel = 'info' | 'warn' | 'error';

const recent = new Map<string, number>();

function detailOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/** Fire-and-forget frontend logging. Logging must never interrupt the UI. */
export function logEvent(level: LogLevel, scope: string, message: string, detail = '') {
  const text = message.trim();
  if (!text) return;
  const key = `${level}:${scope}:${text}`;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < 1500) return;
  recent.set(key, now);
  if (recent.size > 200) {
    for (const [entry, at] of recent) if (now - at > 60_000) recent.delete(entry);
  }
  if (!isTauri()) {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](`[${scope}] ${text}`, detail);
    return;
  }
  void invoke('log_write', { level, scope, message: text, detail: detail.slice(0, 8000) }).catch(() => {});
}

export function logError(scope: string, error: unknown, context = '') {
  const message = detailOf(error);
  logEvent('error', scope, message, context);
}
