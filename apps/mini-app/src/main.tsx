import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import App from './App';

// Telegram appends tgWebApp* params to the URL pathname which confuses React Router.
// Strip them out and redirect to the clean root before anything renders.
if (window.location.pathname.includes('tgWebApp')) {
  window.location.replace(window.location.origin + '/#/');
}

function Root() {
  useEffect(() => {
    WebApp.ready();
    WebApp.expand(); // Request full screen / expanded mode
    // Only clear stale session on fresh app open, not on user-triggered reloads.
    // We detect a reload via the navigation type: 'reload' means the user hit refresh,
    // in which case we keep all sessionStorage so they stay on the same game screen.
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
