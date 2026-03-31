import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getProfile } from './supabase';


const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  error: null,
  refreshProfile: () => {},
});


export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Fetch profile from `profiles` table with timeout
  const fetchProfile = async (userId) => {
    try {
      const profilePromise = getProfile(userId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 10000)
      );
      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);
      if (error) throw error;
      setProfile(data ?? null);
    } catch (err) {
      setProfile(null);
      setError('Failed to fetch profile: ' + (err.message || err.toString()));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let didCancel = false;
    // 1. Restore existing session on app load with timeout
    const sessionPromise = supabase.auth.getSession();
    const sessionTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Session fetch timeout')), 10000)
    );

    Promise.race([sessionPromise, sessionTimeout])
      .then(({ data: { session } }) => {
        if (didCancel) return;
        const u = session?.user ?? null;
        setUser(u);
        if (u) fetchProfile(u.id);
        else setLoading(false);
      })
      .catch((err) => {
        if (didCancel) return;
        setError('Failed to get session: ' + (err.message || err.toString()));
        setLoading(false);
      });

    // 2. Listen for sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (didCancel) return;
        const u = session?.user ?? null;
        setUser(u);
        try {
          if (u) await fetchProfile(u.id);
          else setProfile(null);
        } catch (err) {
          setError('Failed to fetch profile: ' + (err.message || err.toString()));
        } finally {
          setLoading(false);
        }
      }
    );

    return () => {
      didCancel = true;
      subscription.unsubscribe();
    };
  }, []);

  // Expose a manual refresh so screens can call it after profile update
  const refreshProfile = () => {
    if (user) fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
