import { createContext, useContext, useState, useEffect } from "react";

// ── Auth Context ──────────────────────────────────────────────────────────────
// Drop-in Supabase replacement: swap the MOCK_* functions below with real
// Supabase calls and nothing else in the app needs to change.
//
// To go live:
//   1. npm install @supabase/supabase-js
//   2. Replace MOCK_signIn / MOCK_signUp / MOCK_signOut / MOCK_getSession
//      with the Supabase equivalents (see comments on each)
//   3. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env

const AUTH_KEY = "lease-tracker-auth";

// ── Mock auth (localStorage-backed) ──────────────────────────────────────────

function MOCK_getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}

async function MOCK_signIn(email, password) {
  // Supabase: const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  const users = JSON.parse(localStorage.getItem("lease-tracker-users") || "[]");
  const user  = users.find(u => u.email === email && u.password === password);
  if (!user) return { error: "Invalid email or password" };
  const session = { id: user.id, email: user.email, name: user.name };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return { session };
}

async function MOCK_signUp(email, password, name) {
  // Supabase: const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
  const users = JSON.parse(localStorage.getItem("lease-tracker-users") || "[]");
  if (users.find(u => u.email === email)) return { error: "An account with this email already exists" };
  const user = { id: crypto.randomUUID(), email, password, name };
  localStorage.setItem("lease-tracker-users", JSON.stringify([...users, user]));
  const session = { id: user.id, email: user.email, name: user.name };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return { session };
}

async function MOCK_signOut() {
  // Supabase: await supabase.auth.signOut()
  localStorage.removeItem(AUTH_KEY);
}

async function MOCK_updateProfile(userId, { name, email, password, currentPassword }) {
  // Supabase:
  //   if (name || email) await supabase.auth.updateUser({ email, data: { name } })
  //   if (password) await supabase.auth.updateUser({ password })
  const users = JSON.parse(localStorage.getItem("lease-tracker-users") || "[]");
  const idx   = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: "User not found" };
  if (password) {
    if (users[idx].password !== currentPassword) return { error: "Current password is incorrect" };
    users[idx].password = password;
  }
  if (name)  users[idx].name  = name;
  if (email) {
    if (users.find((u, i) => u.email === email && i !== idx)) return { error: "Email already in use" };
    users[idx].email = email;
  }
  localStorage.setItem("lease-tracker-users", JSON.stringify(users));
  const session = { id: users[idx].id, email: users[idx].email, name: users[idx].name };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return { session };
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = MOCK_getSession();
    if (session) setUser(session);
    setLoading(false);
  }, []);

  const signIn = async (email, password) => {
    const result = await MOCK_signIn(email, password);
    if (result.session) setUser(result.session);
    return result;
  };

  const signUp = async (email, password, name) => {
    const result = await MOCK_signUp(email, password, name);
    if (result.session) setUser(result.session);
    return result;
  };

  const signOut = async () => {
    await MOCK_signOut();
    setUser(null);
  };

  const updateProfile = async (updates) => {
    const result = await MOCK_updateProfile(user.id, updates);
    if (result.session) setUser(result.session);
    return result;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
