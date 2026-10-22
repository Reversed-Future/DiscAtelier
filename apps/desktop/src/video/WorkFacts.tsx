import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoFact } from './gateway';
export function WorkFacts({ facts }: { facts: VideoFact[] }) {
  const [error, setError] = useState('');
  if (!facts.length) return null;
  return <><dl className="metadata video-facts">{facts.map((fact, i) => <div key={i}><dt>{fact.label}</dt><dd>{fact.values.map((value, j) => <span key={j}>{value.url
    ? <button type="button" className="video-reference" onClick={() => { setError(''); void invoke('video_open_reference', { url: value.url }).catch(() => setError('无法打开资料链接。')); }}>{value.text} ↗</button>
    : value.text}</span>)}</dd></div>)}</dl>{error && <p className="form-error" role="alert">{error}</p>}</>;
}
