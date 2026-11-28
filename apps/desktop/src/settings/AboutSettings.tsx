import { UpdateSettings } from './UpdateSettings';
import { ThirdPartyCredits } from './ThirdPartyCredits';

export function AboutSettings({ section, onBusy }: { section: 'app' | 'credits'; onBusy(value: boolean): void }) {
  return section === 'app' ? <UpdateSettings onBusy={onBusy}/> : <ThirdPartyCredits/>;
}
