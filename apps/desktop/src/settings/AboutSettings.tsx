import { useState } from 'react';
import { UpdateSettings } from './UpdateSettings';
import { ThirdPartyCredits } from './ThirdPartyCredits';

export function AboutSettings({ onBusy }: { onBusy(value: boolean): void }) {
  const [tab, setTab] = useState<'app' | 'credits'>('app');
  const [busy, setBusy] = useState(false);
  function childBusy(value: boolean) { setBusy(value); onBusy(value); }
  return <div>
    <div className="music-settings-tabs" role="tablist" aria-label="关于页面">
      <button type="button" role="tab" id="about-app-tab" aria-controls="about-app-panel" aria-selected={tab === 'app'} disabled={busy} onClick={() => setTab('app')}>应用与更新</button>
      <button type="button" role="tab" id="about-credits-tab" aria-controls="about-credits-panel" aria-selected={tab === 'credits'} disabled={busy} onClick={() => setTab('credits')}>致谢</button>
    </div>
    <div role="tabpanel" id="about-app-panel" aria-labelledby="about-app-tab" hidden={tab !== 'app'}><UpdateSettings onBusy={childBusy}/></div>
    <div role="tabpanel" id="about-credits-panel" aria-labelledby="about-credits-tab" hidden={tab !== 'credits'}><ThirdPartyCredits/></div>
  </div>;
}
