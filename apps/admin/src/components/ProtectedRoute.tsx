import React from 'react';
import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const jwt = localStorage.getItem('adminJwt');
  if (!jwt) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
