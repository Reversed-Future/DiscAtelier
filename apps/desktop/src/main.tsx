import { createRoot } from 'react-dom/client';
import { App } from './App';
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

createRoot(document.getElementById('root')!).render(<App/>);
