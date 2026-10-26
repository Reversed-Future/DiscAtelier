export interface LyricLine { seconds: number; text: string; translation: string }
export interface Lyrics { original: string; translation: string; romanization: string }
export function parseLrc(text: string): { timed: { seconds: number; text: string }[]; plain: string[] } {
  const offset = Number(/\[offset:\s*(-?\d+)\]/i.exec(text)?.[1] || 0) / 1000;
  const timed: { seconds: number; text: string }[] = [], plain: string[] = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const stamp of stamps) {
      if (Number(stamp[2]) >= 60) continue;
      const seconds = Number(stamp[1]) * 60 + Number(stamp[2]) + Number(`0.${stamp[3] || 0}`) + offset;
      timed.push({ seconds: Math.max(0, seconds), text: content });
    }
    if (!stamps.length && content) plain.push(content);
  }
  timed.sort((a, b) => a.seconds - b.seconds);
  return { timed, plain };
}
export function lyricLines(value: Lyrics): { lines: LyricLine[]; plain: string[] } {
  const original = parseLrc(value.original), translated = parseLrc(value.translation);
  return { lines: original.timed.map(line => ({ ...line, translation: translated.timed.find(t => Math.abs(t.seconds - line.seconds) < .02)?.text || '' })), plain: original.plain };
}
export function activeLyric(lines: LyricLine[], seconds: number): number {
  let low = 0, high = lines.length;
  while (low < high) { const mid = (low + high) >>> 1; if (lines[mid].seconds <= seconds) low = mid + 1; else high = mid; }
  return low - 1;
}
