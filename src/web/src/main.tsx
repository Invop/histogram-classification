import './theme';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connectHub, onHubStatus } from './hub';
import { notifyModelChanged, reloadAssets } from './state';

let everConnected = false;
onHubStatus((s) => {
  if (s !== 'connected') return;
  // after a reconnect, events may have been missed: refresh shared state
  if (everConnected) {
    void reloadAssets();
    notifyModelChanged();
  }
  everConnected = true;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

connectHub();
void reloadAssets();
