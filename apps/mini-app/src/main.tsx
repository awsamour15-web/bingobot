import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import './index.css';
import App from './App';

// Telegram Web injects tgWebApp* params into the pathname (e.g. /tgWebAppData=...).
// This must be fixed BEFORE React/HashRouter mounts or the router matches no routes.
if (window.location.pathname.includes('tgWebApp')) {
  window.history.replaceState(null, '', '/' + window.location.hash);
}

function Root() {
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    // Only clear stale session on fresh app open, not on user-triggered reloads.
    const isReload = performance?.navigation?.type === 1 ||
      (performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload';

    if (!isReload) {
      sessionStorage.removeItem('stakeSelectedForRound');
      sessionStorage.removeItem('selectedRoundId');
      sessionStorage.removeItem('selectedStake');
      // Reset the hash to home so a stale /#/rounds/:id/game URL doesn't persist
      // but preserve intentional deep links like /agent/dashboard
      const keepHashes = ['/agent/dashboard'];
      const currentHash = window.location.hash.replace('#', '');
      const shouldKeep = keepHashes.some(h => currentHash.startsWith(h));
      if (!shouldKeep && window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#') {
        window.location.replace(window.location.pathname + '#/');
      }
    }
  }, []);

  return (
    <HashRouter>
      <App />
    </HashRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
