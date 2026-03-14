import { useContext } from 'react';
import { AuthContext } from './authContext';

/**
 * Lives in its own module so `AuthContext.jsx` exports components only, which
 * is what keeps Vite's fast refresh working for the provider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
