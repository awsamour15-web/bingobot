import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import App from './App';

function Root() {
  useEffect(() => {
    WebApp.ready();
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
