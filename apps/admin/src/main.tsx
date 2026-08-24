import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PlayersPage } from './pages/PlayersPage';
import { GamesPage } from './pages/GamesPage';
import { FinancePage } from './pages/FinancePage';
import { SettingsPage } from './pages/SettingsPage';
import { AgentsPage } from './pages/AgentsPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { CartelasPage } from './pages/CartelasPage';
import { BonusPage } from './pages/BonusPage';
import { MockPlayersPage } from './pages/MockPlayersPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="players/:id" element={<PlayersPage />} />
          <Route path="bonus" element={<BonusPage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="deposits" element={<Navigate to="/finance" replace />} />
          <Route path="withdrawals" element={<Navigate to="/finance" replace />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="cartelas" element={<CartelasPage />} />
          <Route path="mock-players" element={<MockPlayersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
