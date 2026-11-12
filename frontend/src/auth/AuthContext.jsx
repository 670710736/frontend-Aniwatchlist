import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);
const STORAGE_KEY = "anilist.token";
const USER_STORAGE_KEY = "anilist.user";

function readToken() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function readUser() {
  try {
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(readUser);

  function login(nextToken, nextUser = null) {
    setToken(nextToken);
    setUser(nextUser);
    try {
      localStorage.setItem(STORAGE_KEY, nextToken);
      if (nextUser) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      // Keep the session in memory when storage is unavailable.
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  const value = useMemo(
    () => ({
      token,
      user,
      isLoggedIn: Boolean(token),
      login,
      logout,
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth ต้องอยู่ภายใน AuthProvider");
  }
  return context;
}
