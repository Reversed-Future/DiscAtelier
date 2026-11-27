export interface FileCue { start: number; end: number; text: string }
function seconds(timestamp: string) {
  const parts = timestamp.replace(',', '.').split(':').map(Number);
  return parts.reduce((total, value) => total * 60 + value, 0);
}
export function parseSubtitleFile(content: string): FileCue[] {
  const cues: FileCue[] = [];
  const stamp = /^(?:(?:\d{2,}):)?\d{2}:\d{2}[.,]\d{3}$/;
  for (const block of content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const lines = block.trim().split('\n');
    const i = lines.findIndex(line => line.includes('-->'));
    if (i < 0 || i > 1) continue;
    const [begin, finish] = lines[i].split('-->').map(v => v.trim().split(/\s/)[0]);
    if (!stamp.test(begin) || !stamp.test(finish)) continue;
    const start = seconds(begin), end = seconds(finish);
    const text = lines.slice(i + 1).join('\n').replace(/<[^>\n]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
    if (text && end > start) cues.push({ start, end, text });
  }
  return cues.sort((a,b) => a.start - b.start);
}
export function fileTextAt(cues: FileCue[], time: number) {
  let lo = 0, hi = cues.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (cues[mid].start <= time) lo = mid + 1; else hi = mid; }
  const cue = cues[lo - 1];
  return cue && time < cue.end ? cue.text : '';
}
