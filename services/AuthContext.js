import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, getProfile } from './supabase';

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: () => {},
});

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    try {
      const { data } = await getProfile(userId);
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const u = session?.user ?? null;

        if (event === 'INITIAL_SESSION') {
          // Fires immediately from AsyncStorage — no network call.
          // Unblock the navigator right away, then load profile in background.
          setUser(u);
          setLoading(false);
          if (u) fetchProfile(u.id);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setUser(u);
          if (u) fetchProfile(u.id);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(() => {
    if (user) fetchProfile(user.id);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
