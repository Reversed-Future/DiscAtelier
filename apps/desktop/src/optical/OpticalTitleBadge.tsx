import { Icon } from '../ui/Icon';

export function OpticalTitleBadge({ playing, drive }: { playing: boolean; drive: string }) {
  return <span className={`optical-title-badge${playing ? ' playing' : ''}`} role="img"
    aria-label={playing ? `光驱播放中：${drive}` : `在光驱中：${drive}`}
    title={playing ? `光驱播放中 · ${drive}` : `在光驱中 · ${drive}`}>
    <Icon name="disc"/>
  </span>;
}
