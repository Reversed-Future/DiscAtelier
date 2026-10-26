import type { UpdateStatus } from './gateway';

// Local UI preference only; never suppresses manual checks or clears a download.
export const ignoredUpdateKey = 'discatelier.ignored-update-version';
export function ignoredUpdate(storage: Pick<Storage, 'getItem'>): string | null {
  try { return storage.getItem(ignoredUpdateKey); } catch { return null; }
}
export function ignoreUpdate(storage: Pick<Storage, 'setItem'>, version: string) {
  storage.setItem(ignoredUpdateKey, version);
}
export function shouldNotifyUpdate(status: UpdateStatus | null, ignored: string | null): boolean {
  return !!status?.available && status.available.version !== ignored && status.available.version !== status.currentVersion;
}

/** Manual and automatic checks share only their in-flight request. */
export function shareUpdateCheck(check: () => Promise<UpdateStatus>) {
  let pending: Promise<UpdateStatus> | null = null;
  return () => {
    pending ??= Promise.resolve().then(check).finally(() => { pending = null; });
    return pending;
  };
}
/** Exactly one automatic attempt per webview launch, including remounts. */
export function startupUpdateCheck(check: () => Promise<UpdateStatus>) {
  let started: Promise<UpdateStatus | null> | null = null;
  return () => started ??= Promise.resolve().then(check).catch(() => null);
}
