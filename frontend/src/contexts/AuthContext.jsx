import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

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
    const sessionId = hashParams.get("session_id");

    if (sessionId) {
      api
        .post("/auth/session", { session_id: sessionId })
        .then((res) => {
          setUser(res.data.user);
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    } else {
      loadSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = () => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh: loadSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
