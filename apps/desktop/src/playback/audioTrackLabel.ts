/**
 * Human-readable Blu-ray audio track labels. VLC's track description exposes a
 * PID and a generic "轨道 N - [日语]" name; the media track list adds the
 * language code, channel count and codec. Keep the label compact enough for a
 * two-line popover without losing those facts.
 */
export interface AudioTrackInfo {
  id: number;
  title: string;
  language: string;
  codec: string;
  channels: number | null;
}

const LANGUAGES: Record<string, string> = {
  jpn: '日语', ja: '日语', japanese: '日语',
  eng: '英语', en: '英语', english: '英语',
  chi: '中文', zho: '中文', zh: '中文', chinese: '中文',
  fra: '法语', fre: '法语', fr: '法语', french: '法语',
  deu: '德语', ger: '德语', de: '德语', german: '德语',
  spa: '西班牙语', es: '西班牙语', spanish: '西班牙语',
  ita: '意大利语', it: '意大利语', italian: '意大利语',
  kor: '韩语', ko: '韩语', korean: '韩语',
  rus: '俄语', ru: '俄语', russian: '俄语',
  por: '葡萄牙语', pt: '葡萄牙语', portuguese: '葡萄牙语',
  und: '未标注', mis: '未标注', mul: '多语言',
};

export function languageLabel(value: string): string {
  const clean = value.trim();
  if (!clean) return '';
  return LANGUAGES[clean.toLowerCase()] || clean;
}

export function channelsLabel(channels: number | null): string {
  if (channels === null || !Number.isFinite(channels) || channels <= 0) return '';
  if (channels === 1) return '单声道';
  if (channels === 2) return '2.0 立体声';
  if (channels === 6) return '5.1 环绕';
  if (channels === 8) return '7.1 环绕';
  return `${channels} 声道`;
}

export function codecLabel(codec: string): string {
  const clean = codec.trim();
  if (!clean) return '';
  if (/DTS[- ]HD\s+Master/i.test(clean)) return 'DTS-HD MA';
  if (/DTS[- ]HD\s+High\s+Resolution/i.test(clean)) return 'DTS-HD HRA';
  if (/DTS[- ]HD/i.test(clean)) return 'DTS-HD';
  if (/\bDTS\b/i.test(clean)) return 'DTS';
  if (/TrueHD/i.test(clean)) return 'TrueHD';
  if (/Dolby\s+Digital\s+Plus|E-?AC-?3|EAC3/i.test(clean)) return 'DD+';
  if (/Dolby\s+Digital|A\/52|AC-?3|AC3/i.test(clean)) return 'AC3';
  if (/AAC/i.test(clean)) return 'AAC';
  if (/LPCM|PCM/i.test(clean)) return 'LPCM';
  return clean.length > 28 ? `${clean.slice(0, 27)}…` : clean;
}

/** VLC names every Blu-ray audio stream "轨道 N - …"; that prefix is noise. */
function genericTitle(value: string): boolean {
  return !value.trim() || /^(轨道|音轨|track)\s*\d+/i.test(value.trim());
}

export function audioTrackLabel(track: AudioTrackInfo): string {
  const parts: string[] = [];
  const title = track.title.trim();
  // VLC's generic Blu-ray name embeds the language as "轨道 1 - [日语]".
  const bracketed = title.match(/[\[（(]([^\]）)]+)[\]）)]/)?.[1] || '';
  const language = languageLabel(track.language || bracketed);
  const titleIsLanguage = !!LANGUAGES[title.toLowerCase()];
  if (!genericTitle(title) && !titleIsLanguage) parts.push(title);
  if (language) parts.push(language);
  const channels = channelsLabel(track.channels);
  if (channels) parts.push(channels);
  const codec = codecLabel(track.codec);
  if (codec && !parts.includes(codec)) parts.push(codec);
  return parts.join(' · ') || `音轨 ${track.id}`;
}
