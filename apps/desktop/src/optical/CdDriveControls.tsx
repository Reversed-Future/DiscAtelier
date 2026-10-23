import { Select } from '../ui/Select';
import { time } from '../playback/gateway';
import type { PlaybackController } from '../playback/usePlayback';
import type { OpticalMedium } from './gateway';
import { useCdMetadata } from './useCdMetadata';
import { CdMetadataFacts } from './CdMetadataFacts';

export function CdDriveControls({ mount, medium, playlist, onSelect, busy, player }: {
  mount: string; medium: OpticalMedium; playlist: string; onSelect(value: string): void;
  busy: boolean; player: PlaybackController;
}) {
  const metadata = useCdMetadata(mount, medium.token);
  const selected = medium.tracks.find(track => `cd-track:${track.number}` === playlist);
  const track = metadata.tracks.find(item => item.number === selected?.number);
  return <div className="cd-drive-controls">
    <div className="optical-actions">
      <Select label="CD 曲目" value={playlist} options={medium.tracks.map(item => ({ id: `cd-track:${item.number}`, label: `${item.number}. ${metadata.tracks.find(info => info.number === item.number)?.title || `曲目 ${item.number}`} · ${time(item.durationSeconds)}` }))}
        disabled={busy || player.busy} onChange={onSelect}/>
      <button className="solid-button" disabled={busy || player.active || player.busy || !playlist} onClick={() => void player.start(mount, medium.token, playlist)}>播放</button>
    </div>
    <CdMetadataFacts track={track} number={selected?.number} total={medium.tracks.length}/>
    <div className="cd-metadata-status">
      {metadata.loading ? <span role="status">正在识别曲目资料…</span> : <button className="text-button" onClick={metadata.refresh}>重新识别</button>}
      {metadata.error && <span role="status">{metadata.error} 仍可按曲号播放。</span>}
    </div>
  </div>;
}
