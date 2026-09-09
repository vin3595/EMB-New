import React, { createContext, useContext, useEffect, useState } from "react";
import api, { BACKEND_URL, clearAuthToken, setAuthToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
    const authToken = hashParams.get("auth_token");
    if (authToken) {
      setAuthToken(authToken);
      window.history.replaceState(null, "", window.location.pathname);
    }
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google/login`;
  };

  const logout = async () => {
    clearAuthToken();
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — clearing the local token is what actually matters
    }
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh: loadSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
