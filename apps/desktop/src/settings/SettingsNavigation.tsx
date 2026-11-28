import { useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { findSettings, settingsGroups, type SectionId, type SettingsPage } from './settingsDirectory';

interface Props {
  page: SettingsPage;
  busy: boolean;
  onSelect(section: SectionId): void;
}

export function SettingsNavigation({ page, busy, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const filtering = Boolean(query.trim());
  const results = filtering ? findSettings(query) : [];
  function select(id: SectionId) {
    setQuery('');
    onSelect(id);
  }
  return <nav className="settings-nav" aria-label="设置分类">
    <div className="settings-search">
      <Icon name="search"/>
      <input aria-label="搜索设置" placeholder="搜索设置" ref={search} value={query} disabled={busy}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter' && results.length) {
            event.preventDefault(); select(results[0].section.id);
          } else if (event.key === 'Escape' && query) {
            event.preventDefault(); event.stopPropagation(); setQuery('');
          }
        }}/>
      {query && <button aria-label="清除搜索" type="button" disabled={busy} onClick={() => { setQuery(''); search.current?.focus(); }}><Icon name="close"/></button>}
    </div>
    <div className="settings-directory" data-long-scroll>
      {filtering ? <>
        <p className="settings-group-label" role="status">{results.length ? '搜索结果' : '没有找到相关设置'}</p>
        {results.map(({ page: found, section }) => <button type="button" className="settings-result" disabled={busy}
          key={section.id} onClick={() => select(section.id)}>
          <span>{section.label}</span>{section.label !== found.label && <small>{found.label}</small>}
        </button>)}
      </> : settingsGroups.map(group => <div className="settings-group" key={group.label}>
        <p className="settings-group-label">{group.label}</p>
        {group.pages.map(item => <button type="button" className="settings-page-link" key={item.id}
          aria-current={page.id === item.id ? 'page' : undefined} disabled={busy}
          onClick={() => { if (page.id !== item.id) select(item.sections[0].id); }}>
          <Icon name={item.icon}/>{item.label}
        </button>)}
      </div>)}
    </div>
  </nav>;
}

export function SettingsTabs({ page, section, busy, onSelect }: Props & { section: SectionId }) {
  if (page.sections.length === 1) return null;
  return <div className="music-settings-tabs settings-tabs" role="tablist" aria-label={page.label}>
    {page.sections.map((item, index) => <button type="button" role="tab" key={item.id} id={`settings-tab-${item.id}`}
      aria-controls="settings-section" aria-selected={section === item.id} tabIndex={section === item.id ? 0 : -1}
      disabled={busy} onClick={() => onSelect(item.id)} onKeyDown={event => {
        const count = page.sections.length;
        const next = { ArrowLeft: (index + count - 1) % count, ArrowRight: (index + 1) % count, Home: 0, End: count - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        const id = page.sections[next].id;
        onSelect(id); document.getElementById(`settings-tab-${id}`)?.focus();
      }}>{item.label}</button>)}
  </div>;
}
