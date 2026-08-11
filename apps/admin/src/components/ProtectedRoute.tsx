import React from 'react';
import { Navigate } from 'react-router-dom';

function isTokenValid(token: string): boolean {
  try {
    // Check if token has the correct JWT structure (3 parts separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const payload = parts[1];
    if (!payload) return false;
    
    // Parse JWT payload (second part of JWT)
    const decoded = JSON.parse(atob(payload));
    // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const jwt = localStorage.getItem('adminJwt');
  
  if (!jwt || !isTokenValid(jwt)) {
    // Clear invalid/expired token to avoid confusion
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}
