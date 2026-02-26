import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const REMEMBER_KEY       = "lt_remember_me";

function buildUser(supabaseUser) {
  if (!supabaseUser) return null;
  return {
    id:    supabaseUser.id,
    email: supabaseUser.email,
    name:  supabaseUser.user_metadata?.name || supabaseUser.email,
  };
}

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [timedOut,      setTimedOut]      = useState(false);
  const inactivityTimer                   = useRef(null);

  // ── Inactivity timer ──────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
  }, []);

  const resetTimer = useCallback(() => {
    clearTimer();
    inactivityTimer.current = setTimeout(async () => {
      await supabase.auth.signOut();
      setUser(null);
      setTimedOut(true);
    }, INACTIVITY_TIMEOUT);
  }, [clearTimer]);

  // Attach activity listeners when user is logged in
  useEffect(() => {
    if (!user) { clearTimer(); return; }
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // start the timer immediately on login
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimer();
    };
  }, [user, resetTimer, clearTimer]);

  // ── Clear session on tab close if remember me is off ────────────────────
  useEffect(() => {
    const handleUnload = () => {
      if (localStorage.getItem(REMEMBER_KEY) !== "1") {
        supabase.auth.signOut();
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // ── Session init — no flicker ─────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(buildUser(session?.user));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(buildUser(session?.user));
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Auth methods ──────────────────────────────────────────────────────────
  const signIn = async (email, password, rememberMe = false) => {
    setTimedOut(false);
    localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes("invalid")) return { error: "Incorrect email or password." };
      if (error.message.toLowerCase().includes("too many")) return { error: "Too many attempts. Please wait a moment and try again." };
      return { error: error.message };
    }
    return { session: data.session };
  };

  const signUp = async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: error.message };
    return { session: data.session };
  };

  const signOut = async () => {
    clearTimer();
    setTimedOut(false);
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async (_userId, { name, email, password, currentPassword }) => {
    if (password && currentPassword) {
      const { error: reAuthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reAuthError) return { error: "Current password is incorrect" };
    }

    const updates = {};
    if (name || email) updates.data = { name: name || user.name };
    if (email)         updates.email = email;
    if (password)      updates.password = password;

    const { data, error } = await supabase.auth.updateUser(updates);
    if (error) return { error: error.message };

    const updated = buildUser(data.user);
    setUser(updated);
    return { session: updated };
  };

  return (
    <AuthContext.Provider value={{ user, loading, timedOut, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
