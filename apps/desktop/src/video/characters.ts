import type { VideoCharacter } from './gateway';

/** Lower numbers are shown first. Main and supporting cast always outrank cameos. */
export function characterPriority(role: string): number {
  const value = role.trim();
  if (/主角|主演|main/i.test(value)) return 0;
  if (/配角|助演|supporting|support/i.test(value)) return 1;
  if (/客串|guest/i.test(value)) return 2;
  if (/闲角|路人|背景|background|extra/i.test(value)) return 9;
  return 3;
}

export function isIncidental(role: string): boolean {
  return characterPriority(role) === 9;
}

export function visibleCharacters(rows: VideoCharacter[]): VideoCharacter[] {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !isIncidental(row.role))
    .sort((left, right) => characterPriority(left.row.role) - characterPriority(right.row.role) || left.index - right.index)
    .map(({ row }) => row);
}
