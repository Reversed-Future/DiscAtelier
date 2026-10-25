import { Icon } from '../ui/Icon';

export function OpticalTitleBadge({ playing, drive, onOpen }: { playing: boolean; drive: string; onOpen(): void }) {
  return <button type="button" className={`optical-title-badge${playing ? ' playing' : ''}`}
    aria-label={playing ? `光驱播放中：${drive}；打开光驱界面` : `在光驱中：${drive}；打开光驱界面`}
    title={playing ? `光驱播放中 · ${drive} · 打开光驱界面` : `在光驱中 · ${drive} · 打开光驱界面`} onClick={onOpen}>
    <Icon name="disc"/>
  </button>;
}
