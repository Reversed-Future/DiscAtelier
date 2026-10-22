import { sourceLabel, type VideoWork } from './gateway';
import { useState } from 'react';
import { workKey } from './sources';
import { VideoSourceTabs } from './VideoSourceTabs';

export function VideoIntroduction({ work: initial, works }: { work?: VideoWork | null; works?: VideoWork[] }) {
  const [selected,setSelected] = useState('');
  const work = works?.find(row => workKey(row) === selected) || works?.[0] || initial;
  if (!work) return null;
  return <section className="edition-introduction video-introduction"><h4>简介 <small>{sourceLabel(work.source)}</small></h4>{works && <VideoSourceTabs works={works} selected={workKey(work)} onChange={setSelected}/>}<p>{work.summary || '此来源暂无简介。'}</p></section>;
}
