import { TrayPanel } from './shell/TrayPanel';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ExchangeProvider } from './exchange/ExchangeContext';
import { logError, logEvent } from './logging';
import './styles/exchange.css';
import './video/video.css';
import './video/parts.css';
import './collection/list.css';
import './styles/shell.css';
import './styles/store.css';
import './styles/inspection.css';
import './styles/controls.css';
import './styles/desktop.css';
import './styles/models.css';
import './styles/shelf.css';
import './styles/optical.css';
import './styles/playback.css';
import './styles/catalog.css';
import './styles/settings.css';
import './styles/integrations.css';
import './styles/music-dock.css';
import './styles/window-chrome.css';

window.addEventListener('error', event => {
  if (event.error || event.message) logError('window', event.error || event.message, `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`);
});
window.addEventListener('unhandledrejection', event => logError('unhandled-rejection', event.reason));
logEvent('info', 'app', 'frontend started');

createRoot(document.getElementById('root')!).render(location.hash === '#tray' ? <TrayPanel/> : <ExchangeProvider><App/></ExchangeProvider>);
