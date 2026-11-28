import { useEffect, useRef, useState } from 'react';
import { WindowSettings } from '../shell/WindowSettings';
import { VideoSettings } from '../video/VideoSettings';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { PlaybackSettings } from '../optical/PlaybackSettings';
import { IntegrationSettings } from '../integrations/IntegrationSettings';
import { ExchangeSettings } from '../exchange/ExchangeSettings';
import { EqualizerSettings } from '../playback/EqualizerSettings';
import { DataSettings } from './DataSettings';
import { MusicSettings } from './MusicSettings';
import { AboutSettings } from './AboutSettings';
import { SubtitleSettings, type SubtitleSection } from './SubtitleSettings';
import { SettingsNavigation, SettingsTabs } from './SettingsNavigation';
import { settingsPages, type SectionId } from './settingsDirectory';

const entryPoints = { home: 'backups', discogs: 'discogs', about: 'app', audio: 'equalizer' } as const;

export function Settings({ initialPage, libraryAvailable, onRestore, onClose }: {
  initialPage: keyof typeof entryPoints; libraryAvailable: boolean; onRestore(): void; onClose(): void;
}) {
  const [section, setSection] = useState<SectionId>(entryPoints[initialPage]);
  const [subtitleSection, setSubtitleSection] = useState<SubtitleSection>();
  const [busy, setBusy] = useState(false);
  const page = settingsPages.find(item => item.sections.some(tab => tab.id === section))!;
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  function navigate(id: SectionId) {
    if (busy) return;
    if (id === 'appearance' || id === 'speech' || id === 'models') setSubtitleSection(id);
    setSection(id);
  }
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [section]);
  useEffect(() => { enter(content.current, 3); }, [page.id]);

  function controls() {
    switch (section) {
      case 'window': return <WindowSettings/>;
      case 'backups': case 'logs': return <DataSettings section={section} libraryAvailable={libraryAvailable} onRestore={onRestore} onBusy={setBusy}/>;
      case 'discogs': case 'musicbrainz': case 'netease': return <MusicSettings section={section} onBusy={setBusy}/>;
      case 'assistant': return <IntegrationSettings kind="assistant" onBusy={setBusy}/>;
      case 'tmdb': case 'bangumi': return <VideoSettings section={section} onBusy={setBusy}/>;
      case 'today': case 'ratesApi': return <ExchangeSettings section={section} onBusy={setBusy}/>;
      case 'mediaKeys': case 'bluray': case 'engines': return <PlaybackSettings section={section} onBusy={setBusy}/>;
      case 'equalizer': return <EqualizerSettings/>;
      case 'app': case 'credits': return <AboutSettings section={section} onBusy={setBusy}/>;
      case 'appearance': case 'speech': case 'models': return null;
    }
  }
  return <Modal title="设置" onClose={onClose} busy={busy} className="settings-panel">
    <div className="settings-layout">
      <SettingsNavigation page={page} busy={busy} onSelect={id => { navigate(id); heading.current?.focus(); }}/>
      <div className="settings-workspace">
        <header className="settings-page-heading">
          <h3 ref={heading} tabIndex={-1} id="settings-page-title">{page.label}</h3>
          <SettingsTabs page={page} section={section} busy={busy} onSelect={navigate}/>
        </header>
        <div ref={content} id="settings-section" className="settings-content" data-long-scroll
          role={page.sections.length > 1 ? 'tabpanel' : 'region'}
          aria-labelledby={page.sections.length > 1 ? `settings-tab-${section}` : 'settings-page-title'}>
          {controls()}
          {subtitleSection && <div hidden={page.id !== 'subtitles'}>
            <SubtitleSettings section={subtitleSection} onAssistant={() => navigate('assistant')} onBusy={setBusy}/>
          </div>}
        </div>
      </div>
    </div>
  </Modal>;
}
