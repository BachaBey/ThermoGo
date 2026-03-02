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
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (authError) return { data: null, error: authError };

  const userId = authData.user?.id;
  if (!userId) return { data: null, error: new Error('No user ID returned after signup') };

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .insert([{ id: userId, first_name: firstName, last_name: lastName, phone }])
    .select()
    .single();

  if (profileError) return { data: null, error: profileError };

  return { data: { user: authData.user, profile: profileData }, error: null };
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
    .single();
  return { data, error };
};

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)                   // { first_name, last_name, phone }
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
};

// ═════════════════════════════════════════════════════════════════════════════
// DEVICES
// Columns: id uuid PK, device_id text unique, user_id uuid→profiles,
//          name text, target_temp numeric, target_humidity numeric,
//          threshold_temp numeric, threshold_humidity numeric, connected_at
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

/**
 * Register a new device with optional metadata.
 * @param {string} userId
 * @param {object} fields - { device_id, name, target_temp, target_humidity, threshold_temp, threshold_humidity }
 */
export const addDevice = async (userId, fields) => {
  const { data, error } = await supabase
    .from('devices')
    .insert([{ ...fields, user_id: userId }])
    .select()
    .single();
  return { data, error };
};

/**
 * Update device metadata (name, targets, thresholds).
 * @param {string} deviceUuid - devices.id (uuid PK)
 * @param {object} updates    - any subset of { name, target_temp, target_humidity, threshold_temp, threshold_humidity }
 */
export const updateDevice = async (deviceUuid, updates) => {
  const { data, error } = await supabase
    .from('devices')
    .update(updates)
    .eq('id', deviceUuid)
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

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

/** Fetch all notifications for the user, newest first. */
export const getNotifications = async (userId) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, devices(device_id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
};

/** Mark a single notification as read. */
export const markNotificationRead = async (id) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  return { error };
};

/** Mark ALL unread notifications for the user as read. */
export const markAllNotificationsRead = async (userId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return { error };
};
