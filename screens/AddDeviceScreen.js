import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { useAuth }  from '../services/AuthContext';
import { getUserDevices, addDevice, deleteDevice, subscribeToDevices } from '../services/supabase';
import { MOCK_DEVICES } from '../services/mockData';
import { Button, Input, Card, Divider } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const USE_MOCK = false;

const AddDeviceScreen = () => {
  const { theme } = useTheme();
  const { user }  = useAuth();

  const [deviceId,        setDeviceId]        = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState('');
  const [existingDevices, setExistingDevices] = useState([]);

  // ── Auto-clear messages after 5 seconds ───────────────────────────────────
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  // ── Fetch devices ──────────────────────────────────────────────────────────
  const fetchDevices = async () => {
    if (USE_MOCK) { setExistingDevices(MOCK_DEVICES); return; }
    const { data } = await getUserDevices(user.id);
    setExistingDevices(data || []);
  };

  useEffect(() => { fetchDevices(); }, []);

  // ── Realtime: auto-refresh on INSERT/DELETE ────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) return;
    const channel = subscribeToDevices(() => fetchDevices());
    return () => channel.unsubscribe();
  }, []);

  // ── Add device ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    setError(''); setSuccess('');
    const trimmed = deviceId.trim().toUpperCase();

    if (!trimmed) { setError('Please enter a Device ID.'); return; }
    if (!/^[A-Z0-9\-_]+$/.test(trimmed)) {
      setError('Device ID may only contain letters, numbers, dashes, and underscores.');
      return;
    }

    setLoading(true);
    try {
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 600));
        setExistingDevices(prev => [
          { id: String(Date.now()), device_id: trimmed, user_id: 'mock', connected_at: new Date().toISOString() },
          ...prev,
        ]);
        setDeviceId('');
        setSuccess(`Device "${trimmed}" registered successfully!`);
        return;
      }

      const { error: addError } = await addDevice(user.id, trimmed);
      if (addError) {
        setError(
          addError.code === '23505' || addError.message.includes('unique')
            ? `Device ID "${trimmed}" is already registered.`
            : addError.message
        );
      } else {
        setDeviceId('');
        setSuccess(`Device "${trimmed}" registered successfully!`);
        fetchDevices();
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Delete device ──────────────────────────────────────────────────────────
  const handleDelete = (device) => {
    const confirm = () => {
      if (USE_MOCK) {
        setExistingDevices(prev => prev.filter(d => d.id !== device.id));
        return;
      }
      deleteDevice(device.id).then(({ error: delError }) => {
        if (delError) setError(delError.message);
        else fetchDevices();
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove device "${device.device_id}" from your account?`)) confirm();
    } else {
      Alert.alert(
        'Remove Device',
        `Remove "${device.device_id}" from your account?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: confirm }]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

          {/* ── Register form ── */}
          <Card style={styles.formCard}>
            {/* Card title */}
            <View style={styles.cardTitleRow}>
              <View style={[styles.cardTitleIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Register New Device</Text>
                <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
                  Enter the hardware ID printed on your sensor
                </Text>
              </View>
            </View>

            <Divider />

            {/* Error / success banners */}
            {error ? (
              <View style={[styles.alertBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
                <Ionicons name="warning-outline" size={16} color={theme.danger} />
                <Text style={[styles.alertText, { color: theme.danger }]}>{error}</Text>
              </View>
            ) : null}
            {success ? (
              <View style={[styles.alertBox, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={theme.success} />
                <Text style={[styles.alertText, { color: theme.success }]}>{success}</Text>
              </View>
            ) : null}

            <Input
              label="Device ID"
              value={deviceId}
              onChangeText={t => setDeviceId(t.toUpperCase())}
              placeholder="e.g. THM-001"
              autoCapitalize="characters"
            />

            <Button title="Register Device" onPress={handleAdd} loading={loading} />

            {/* Hint row */}
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                The Device ID is printed on the back of your sensor unit.
              </Text>
            </View>
          </Card>

          {/* ── Registered devices ── */}
          {existingDevices.length > 0 && (
            <Card>
              {/* Section title */}
              <View style={styles.cardTitleRow}>
                <View style={[styles.cardTitleIcon, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="hardware-chip" size={20} color={theme.primary} />
                </View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  My Devices ({existingDevices.length})
                </Text>
              </View>

              <Divider />

              {existingDevices.map((device, index) => (
                <View key={device.id}>
                  <View style={styles.deviceRow}>
                    {/* Device icon */}
                    <View style={[styles.deviceIconCircle, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="hardware-chip-outline" size={20} color={theme.primary} />
                    </View>

                    {/* Device info */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deviceIdText, { color: theme.text }]}>
                        {device.device_id}
                      </Text>
                      <View style={styles.deviceMetaRow}>
                        <Ionicons name="calendar-outline" size={11} color={theme.textMuted} />
                        <Text style={[styles.deviceDate, { color: theme.textMuted }]}>
                          Connected {new Date(device.connected_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    {/* Remove button */}
                    <TouchableOpacity
                      onPress={() => handleDelete(device)}
                      style={[styles.deleteBtn, { borderColor: theme.danger }]}
                    >
                      <Ionicons name="trash-outline" size={14} color={theme.danger} />
                      <Text style={[styles.deleteBtnText, { color: theme.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>

                  {index < existingDevices.length - 1 && (
                    <View style={[styles.innerDivider, { backgroundColor: theme.divider }]} />
                  )}
                </View>
              ))}
            </Card>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { padding: SPACING.base, paddingTop: SPACING.lg, paddingBottom: 80 },

  formCard: { marginBottom: SPACING.base },

  cardTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: SPACING.sm, marginBottom: SPACING.xs,
  },
  cardTitleIcon: {
    width: 38, height: 38, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: FONT_SIZES.base, fontWeight: '700' },
  sectionSub:   { fontSize: FONT_SIZES.xs, marginTop: 2 },

  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.base,
  },
  alertText: { fontSize: FONT_SIZES.sm, fontWeight: '500', flex: 1 },

  hintRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: SPACING.xs, marginTop: SPACING.md,
  },
  hint: { fontSize: FONT_SIZES.xs, lineHeight: 18, flex: 1 },

  // Device list row
  deviceRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: SPACING.md, paddingVertical: SPACING.sm,
  },
  deviceIconCircle: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  deviceIdText: { fontSize: FONT_SIZES.base, fontWeight: '700' },
  deviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  deviceDate:    { fontSize: FONT_SIZES.xs },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
  },
  deleteBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  innerDivider: { height: 1, marginVertical: SPACING.xs },
});

export default AddDeviceScreen;
