import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import App from './App';

function Root() {
  useEffect(() => {
    WebApp.ready();
    // Clear stale sessionStorage so users always land on the home screen
    // when reopening the mini-app (avoids being stuck on a finished game route)
    sessionStorage.removeItem('stakeSelectedForRound');
    sessionStorage.removeItem('selectedRoundId');
    sessionStorage.removeItem('selectedStake');
    // Reset the hash to home so a stale /#/rounds/:id/game URL doesn't persist
    if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#') {
      window.location.replace(window.location.pathname + '#/');
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
