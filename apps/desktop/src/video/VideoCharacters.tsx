import { videoImageUrl, type VideoWork, type VideoCharacter } from './gateway';
import { useState } from 'react';
function Portrait({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = videoImageUrl(url);
  return src && !failed ? <img className="video-character-portrait" src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className="video-character-no-image">暂无图片</span>;
}
export function VideoCharacters({ work, rows: supplied }: { work?: VideoWork | null; rows?: VideoCharacter[] }) {
  const rows = supplied || (work?.source === 'bangumi' ? work.characters || [] : []);
  if (!rows.length) return <p className="utility-copy">暂无角色资料。</p>;
  return <ul className="video-characters">{rows.map((row, i) => <li key={i}>
    <Portrait key={row.portraitUrl} url={row.portraitUrl || ''} name={row.name}/>
    <div className="video-character-copy"><div><strong>{row.name}</strong><span>{row.role}</span></div>
      {!!row.facts?.length && <dl className="video-character-facts">{row.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.values.map(v => v.text).join(' / ')}</dd></div>)}</dl>}
      {row.actors.length > 0 && <p className="video-character-actors">声优 · {row.actors.join(' / ')}</p>}
    </div>
  </li>)}</ul>;
}
