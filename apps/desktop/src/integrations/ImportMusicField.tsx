import type { ReleaseTrack } from '../metadata/gateway';
import type { MusicSupplement } from './gateway';
import { trackMatches } from './trackMatches';

export function ImportMusicField({ tracks, value, onChange, onPick }: {
  tracks: ReleaseTrack[]; value: MusicSupplement | null; onChange(value: MusicSupplement | null): void; onPick(): void;
}) {
  return <><div className="import-music-field"><div><span>网易云资料</span>{value && <><strong>{value.title}</strong><small>{value.artists.join(' / ')} · 已匹配 {trackMatches(tracks, value).size} 首</small></>}</div>
    <button type="button" className="text-button" onClick={onPick}>{value ? '更换' : '匹配'}</button>
    {value && <button type="button" className="text-button" onClick={() => onChange(null)}>移除</button>}
  </div></>;
}
