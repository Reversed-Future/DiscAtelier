import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteSelectedBackups, fileSize } from '../apps/desktop/src/settings/backupFiles.ts';

test('deletions are serial and stop at failure while reporting completed files', async () => {
  const visited = [];
  let running = 0;
  const cause = new Error('file in use');
  const result = await deleteSelectedBackups(['one', 'two', 'three'].map(name => ({ name })), async entry => {
    assert.equal(running++, 0);
    await new Promise(resolve => setTimeout(resolve, 1));
    visited.push(entry.name); running--;
    if (entry.name === 'two') throw cause;
  });
  assert.deepEqual(visited, ['one', 'two']);
  assert.deepEqual(result, { deleted: ['one'], failed: 'two', cause });
});

test('empty selection performs no deletions and a successful selection reports exact files', async () => {
  const visited = [];
  const remove = async entry => visited.push(entry.name);
  assert.deepEqual(await deleteSelectedBackups([], remove), { deleted: [], failed: null, cause: null });
  assert.deepEqual(await deleteSelectedBackups([{ name: 'chosen' }], remove), { deleted: ['chosen'], failed: null, cause: null });
  assert.deepEqual(visited, ['chosen']);
  assert.equal(fileSize(0), '0 B');
  assert.equal(fileSize(1024 ** 3 * 1.5), '1.5 GiB');
});
