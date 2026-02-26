import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id:    session.user.id,
          email: session.user.email,
          name:  session.user.user_metadata?.name || session.user.email,
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id:    session.user.id,
          email: session.user.email,
          name:  session.user.user_metadata?.name || session.user.email,
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
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
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async (userId, { name, email, password, currentPassword }) => {
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

    const updatedUser = {
      id:    data.user.id,
      email: data.user.email,
      name:  data.user.user_metadata?.name || data.user.email,
    };
    setUser(updatedUser);
    return { session: updatedUser };
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
