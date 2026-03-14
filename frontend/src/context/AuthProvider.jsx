import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { AuthContext } from './authContext';

const TOKEN_KEY = 'token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Derived from storage at mount rather than set inside the effect: there is
  // nothing to verify when no token exists, so the app should never flash a
  // loading screen for it.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;

    let cancelled = false;
    api
      .verifyToken()
      .then((res) => {
        if (!cancelled) setUser(res.data.user);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password);
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setUser(res.data.user);
    return res;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
