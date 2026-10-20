export function measureSync<T>(name: string, task: () => T): T {
  const start = performance.now();
  try { return task(); }
  finally { performance.measure(`model.${name}`, { start, end: performance.now() }); }
}
export async function measureAsync<T>(name: string, task: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await task(); }
  finally { performance.measure(`model.${name}`, { start, end: performance.now() }); }
}
