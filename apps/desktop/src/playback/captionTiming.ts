export interface CaptionMark { index: number; start: number; end: number }
export interface CaptionCue { start: number; end: number; text: string; marks: CaptionMark[]; translation?: string }
interface Unit { first: number; last: number }
const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const eastAsian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function units(text: string) {
  const result: Unit[] = [];
  const append = (first: number, length: number) => result.push({ first, last: first + length });
  for (const word of words.segment(text)) {
    if (word.isWordLike && eastAsian.test(word.segment)) {
      for (const part of graphemes.segment(word.segment)) append(word.index + part.index, part.segment.length);
    } else if (!word.isWordLike && result.length) {
      result[result.length - 1].last = word.index + word.segment.length;
    } else if (word.segment.trim()) append(word.index, word.segment.length);
  }
  return result;
}

export function captionSteps(cue: CaptionCue) {
  const original = units(cue.text), translation = units(cue.translation || '');
  // Tokens may contain multiple written characters, or only part of an English
  // word. Keep complete graphemes and map their onset to the owning token.
  const marks = cue.marks;
  const owners = original.map(unit => {
    let i = marks.length - 1;
    while (i >= 0 && marks[i].index > unit.first) i--;
    return i;
  });
  const times = original.map((_, index) => {
    const owner = owners[index], mark = marks[owner];
    if (!mark) return cue.start + (cue.end - cue.start) * index / original.length;
    let first = index, last = index;
    while (first > 0 && owners[first - 1] === owner) first--;
    while (last + 1 < owners.length && owners[last + 1] === owner) last++;
    const end = Math.min(mark.end, marks[owner + 1]?.start ?? cue.end);
    return mark.start + (end - mark.start) * (index - first) / (last - first + 1);
  });
  const steps = original.map((unit, i) => ({ at: times[i], sourceEnd: unit.last, translationEnd: 0 }));
  // The translation provider returns sentences. Pace its written characters
  // across the source timing intervals without claiming a word-for-word alignment.
  translation.forEach((unit, i) => {
    if (!times.length) return;
    const progress = i * times.length / translation.length;
    const idx = Math.floor(progress);
    const end = times[idx + 1] ?? cue.end;
    steps.push({ at: times[idx] + (end - times[idx]) * (progress - idx), sourceEnd: 0, translationEnd: unit.last });
  });
  // Leave the complete line readable even if Whisper places its final token
  // exactly at the exclusive cue end.
  const lastOnset = Math.max(times[0] ?? cue.start, cue.end - Math.min(0.20, (cue.end - cue.start) / 4));
  for (const step of steps) step.at = Math.min(step.at, lastOnset);
  return steps.sort((a, b) => a.at - b.at);
}
