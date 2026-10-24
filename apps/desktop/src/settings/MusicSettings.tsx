import { useEffect, useState } from 'react';
import { discogs } from '../metadata/gateway';
import { DiscogsSettings } from '../metadata/DiscogsSettings';
import { IntegrationSettings } from '../integrations/IntegrationSettings';
import { errorMessage } from '../library/gateway';

type Section = 'discogs' | 'musicbrainz' | 'netease';

const sections: { id: Section; label: string }[] = [
  { id: 'musicbrainz', label: 'MusicBrainz' },
  { id: 'discogs', label: 'Discogs' },
  { id: 'netease', label: '网易云' },
];

export function MusicSettings({ initialSection = 'musicbrainz', onBusy }: {
  initialSection?: Section; onBusy(value: boolean): void;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void discogs.configured().then(value => { if (active) setConfigured(value); })
      .catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, []);
  function childBusy(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  return <div className="music-settings">
    <div className="music-settings-tabs" role="tablist" aria-label="音乐资料源">
      {sections.map(item => <button key={item.id} type="button" role="tab" id={`music-tab-${item.id}`}
        aria-selected={section === item.id} aria-controls={`music-panel-${item.id}`}
        disabled={busy} onClick={() => { setError(''); setSection(item.id); }}>{item.label}</button>)}
    </div>
    <section role="tabpanel" id={`music-panel-${section}`} aria-labelledby={`music-tab-${section}`} className="music-settings-panel">
      {section === 'discogs' && <DiscogsSettings configured={configured} onConfigured={setConfigured} onBusy={childBusy} disabled={busy}/>}
      {section === 'musicbrainz' && <IntegrationSettings key="musicbrainz" kind="musicbrainz" onBusy={childBusy}/>}
      {section === 'netease' && <IntegrationSettings key="netease" kind="netease" onBusy={childBusy}/>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </div>;
}
