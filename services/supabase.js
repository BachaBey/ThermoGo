import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Replace with your actual Supabase project credentials ───────────────────
const SUPABASE_URL = 'https://cxanxrjmxvtckfkppmdt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4YW54cmpteHZ0Y2tma3BwbWR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1Mzc5MzAsImV4cCI6MjA4NzExMzkzMH0.nWxFpAwgYDVr70ctrxjVM4j21cmfaxh8n3CKQOXTOtk';
// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sign up: creates auth user, then inserts profile row.
 * profiles.id = auth.users.id (FK constraint)
 */
export const signUp = async ({ email, password, firstName, lastName, phone }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        phone: phone,
      },
    },
  });
  return { data, error };
};

/** Sign in with email + password */
export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
};

/** Sign out */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

// ═════════════════════════════════════════════════════════════════════════════
// PROFILES  (id, first_name, last_name, phone, created_at)
// ═════════════════════════════════════════════════════════════════════════════

export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .limit(1)           // ← safer than .single()
    .then(res => ({
      data: res.data?.[0] ?? null,
      error: res.error,
    }));
  return { data, error };
};

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select();          // ← removed .single()

  if (error) return { data: null, error };

  // Return the first row (there should only ever be one)
  return { data: data?.[0] ?? null, error: null };
};

// ═════════════════════════════════════════════════════════════════════════════
// DEVICES  (id uuid PK, device_id text unique, user_id uuid→profiles, connected_at)
// ═════════════════════════════════════════════════════════════════════════════

/** Fetch all devices for the logged-in user. RLS filters automatically. */
export const getUserDevices = async (userId) => {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .order('connected_at', { ascending: false });
  return { data, error };
};

/** Register a new device. device_id = hardware text ID, user_id = auth uid. */
export const addDevice = async (userId, deviceId) => {
  const { data, error } = await supabase
    .from('devices')
    .insert([{ device_id: deviceId, user_id: userId }])
    .select()
    .single();
  return { data, error };
};

/** Delete a device by its uuid PK. RLS ensures only the owner can delete. */
export const deleteDevice = async (deviceUuid) => {
  const { error } = await supabase.from('devices').delete().eq('id', deviceUuid);
  return { error };
};

// ═════════════════════════════════════════════════════════════════════════════
// SENSOR READINGS  (id bigint, device_id uuid→devices.id, temperature, humidity, created_at)
// ═════════════════════════════════════════════════════════════════════════════

/** Latest single reading for a device (by devices.id uuid). */
export const getLatestReading = async (deviceUuid) => {
  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .eq('device_id', deviceUuid)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return { data, error };
};

/** Historical readings for a device, optional date range. */
export const getSensorHistory = async (deviceUuid, startDate = null, endDate = null) => {
  let query = supabase
    .from('sensor_readings')
    .select('id, temperature, humidity, created_at')
    .eq('device_id', deviceUuid)
    .order('created_at', { ascending: true });

  if (startDate) query = query.gte('created_at', startDate.toISOString());
  if (endDate)   query = query.lte('created_at', endDate.toISOString());

  const { data, error } = await query;
  return { data, error };
};

// ═════════════════════════════════════════════════════════════════════════════
// REALTIME SUBSCRIPTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to INSERT on sensor_readings.
 * RLS automatically scopes results to the current user's devices.
 *
 * @param {(payload: { new: object }) => void} onInsert
 * @returns channel — call channel.unsubscribe() on component unmount
 */
export const subscribeToSensorReadings = (onInsert) => {
  const channel = supabase
    .channel('sensor-updates')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
      (payload) => onInsert(payload)
    )
    .subscribe();
  return channel;
};

/**
 * Subscribe to INSERT / DELETE on devices table.
 * Useful for auto-refreshing the device list.
 */
export const subscribeToDevices = (onChange) => {
  const channel = supabase
    .channel('device-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'devices' },
      (payload) => onChange(payload)
    )
    .subscribe();
  return channel;
};
