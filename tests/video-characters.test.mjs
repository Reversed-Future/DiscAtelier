import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleCharacters } from '../apps/desktop/src/video/characters.ts';

const character = (name, role) => ({ name, role, actors: [] });

test('main and supporting characters outrank cameos and incidental roles are hidden', () => {
  const rows = [
    character('路人甲', '闲角'),
    character('雪野百香里', '客串'),
    character('立花泷', '主角'),
    character('宫水三叶', '配角'),
    character('无名', ''),
  ];
  assert.deepEqual(
    visibleCharacters(rows).map(row => row.name),
    ['立花泷', '宫水三叶', '雪野百香里', '无名'],
  );
});

test('characters with the same role keep their source order', () => {
  const rows = [
    character('配角 B', '配角'),
    character('主角 A', '主角'),
    character('配角 A', '配角'),
  ];
  assert.deepEqual(visibleCharacters(rows).map(row => row.name), ['主角 A', '配角 B', '配角 A']);
});
