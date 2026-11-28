import { copyAction, setContextActions } from '../ui/contextActions';

interface Props {
  number: number;
  title: string;
  duration?: string;
  current: boolean;
  dock?: boolean;
  onPlay?: () => void;
}

export function QueueTrackButton({number, title, duration, current, dock, onPlay}: Props) {
  const className = [dock && 'music-queue-track', !onPlay && 'is-unavailable'].filter(Boolean).join(' ');
  return <button type="button" className={className} aria-current={current || undefined}
    aria-disabled={!onPlay || undefined} tabIndex={onPlay ? undefined : -1} onClick={onPlay}
    onContextMenu={event => setContextActions(event, [
      ...(onPlay ? [{label: '播放这首', run: onPlay}] : []),
      copyAction('复制曲名', title),
    ])}>
    <span>{String(number).padStart(2, '0')}</span><strong>{title}</strong>{duration && <time>{duration}</time>}
  </button>;
}
