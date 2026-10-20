/** One completed asset; in-flight consumers share work and cancel independently. */
export function createModelCache<T>(read: (id: string, signal: AbortSignal) => Promise<T>) {
  let recent: { id: string; value: T } | undefined;
  const pending = new Map<string, { controller: AbortController; users: number; promise: Promise<T> }>();
  return function load(id: string, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (recent?.id === id) return Promise.resolve(recent.value);
    let task = pending.get(id);
    if (!task) {
      const controller = new AbortController();
      const entry = { controller, users: 0, promise: undefined as unknown as Promise<T> };
      entry.promise = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return read(id, controller.signal); })
        .then(value => {
          controller.signal.throwIfAborted();
          if (entry.users > 0) recent = { id, value };
          return value;
        }).finally(() => { if (pending.get(id) === entry) pending.delete(id); });
      pending.set(id, entry); task = entry;
    }
    const shared = task;
    shared.users++;
    return new Promise((resolve, reject) => {
      let done = false;
      function finish() {
        if (done) return false;
        done = true; signal.removeEventListener('abort', abort);
        if (--shared.users === 0) {
          shared.controller.abort();
          if (pending.get(id) === shared) pending.delete(id);
        }
        return true;
      }
      function abort() { if (finish()) reject(signal.reason); }
      signal.addEventListener('abort', abort, { once: true });
      shared.promise.then(value => { if (finish()) resolve(value); }, error => { if (finish()) reject(error); });
    });
  };
}
