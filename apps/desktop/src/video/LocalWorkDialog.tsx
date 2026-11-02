import { useState } from 'react';
import { Modal } from '../ui/Modal';
import type { VideoWork } from './gateway';

export function LocalWorkDialog({ onAdd, onClose }: { onAdd(work: VideoWork): void; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  function add() {
    if (!title.trim()) { setError('请输入作品标题。'); return; }
    onAdd({
      source: 'local', externalId: Date.now(), title: title.trim(), originalTitle: '', summary: '', premiereDate: '',
      posterUrl: '', episodeCount: null, genres: [], people: [], facts: [], characters: [], chapters: [], images: [],
    });
  }
  return <Modal title="本地新建来源" onClose={onClose} wide className="editor-panel">
    <div className="content-editor">
      <p className="setting-hint">不访问 Bangumi 或 TMDB，建立一份只属于这份收藏的本地作品来源。建立后可在“资料”页补充章节、角色和图片。</p>
      <div className="content-editor-scroll">
        <label>作品标题<input autoFocus value={title} placeholder="例如：夏日重现 · 本地资料" onChange={e => setTitle(e.target.value)}/></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="settings-actions"><button type="button" className="solid-button" onClick={add}>建立并关联</button></footer>
    </div>
  </Modal>;
}
