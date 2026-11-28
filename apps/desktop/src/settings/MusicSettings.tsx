import { useEffect, useState } from 'react';
import { discogs } from '../metadata/gateway';
import { DiscogsSettings } from '../metadata/DiscogsSettings';
import { IntegrationSettings } from '../integrations/IntegrationSettings';
import { errorMessage } from '../library/gateway';

type Section = 'discogs' | 'musicbrainz' | 'netease';

export function MusicSettings({ section, onBusy }: {
  section: Section; onBusy(value: boolean): void;
}) {
  const [configured, setConfigured] = useState(false);

  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void discogs.configured().then(value => { if (active) setConfigured(value); })
      .catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, []);
  return <div className="music-settings-panel">
      {section === 'discogs' && <DiscogsSettings configured={configured} onConfigured={setConfigured} onBusy={onBusy}/>}
      {section === 'musicbrainz' && <IntegrationSettings key="musicbrainz" kind="musicbrainz" onBusy={onBusy}/>}
      {section === 'netease' && <IntegrationSettings key="netease" kind="netease" onBusy={onBusy}/>}
      {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
