import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
// Placeholder pages (will be implemented in 18.2–18.5)
import { PlayersPage } from './pages/PlayersPage';
import { GamesPage } from './pages/GamesPage';
import { FinancePage } from './pages/FinancePage';
import { SettingsPage } from './pages/SettingsPage';
import { DepositsPage } from './pages/DepositsPage';
import { AgentsPage } from './pages/AgentsPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/players" replace />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="players/:id" element={<PlayersPage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="deposits" element={<DepositsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
