import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Alert, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { useAuth }  from '../services/AuthContext';
import {
  getUserDevices, addDevice, updateDevice,
  deleteDevice, subscribeToDevices,
} from '../services/supabase';
import { Button, Input, Card, Divider } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const USE_MOCK = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const emptyForm = () => ({
  device_id:          '',
  name:               '',
  target_temp:        '',
  target_humidity:    '',
  threshold_temp:     '',
  threshold_humidity: '',
});

const numericField = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);

// ─── Labelled numeric input (supports negatives) ─────────────────────────────
// Using keyboardType="default" because "numeric" on iOS/Android blocks the minus key.
// We validate manually: allow digits, one leading minus, one decimal point.
const sanitizeNum = (v) => {
  // Allow: optional leading -, digits, optional single dot, digits
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  // Only allow minus at start
  const parts = cleaned.split('-');
  if (parts.length > 2) return '-' + parts.slice(1).join('').replace(/-/g,'');
  // Only allow one decimal point
  const withMinus = cleaned.startsWith('-');
  const abs = withMinus ? cleaned.slice(1) : cleaned;
  const dotParts = abs.split('.');
  const sanitized = dotParts[0] + (dotParts.length > 1 ? '.' + dotParts.slice(1).join('') : '');
  return (withMinus ? '-' : '') + sanitized;
};

const NumInput = ({ label, value, onChangeText, suffix, placeholder, theme }) => (
  <View style={ni.wrap}>
    <Text style={[ni.label, { color: theme.textMuted }]}>{label}</Text>
    <View style={[ni.row, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <Input
        value={value}
        onChangeText={(v) => onChangeText(sanitizeNum(v))}
        placeholder={placeholder}
        keyboardType="default"
        style={ni.input}
        noLabel
      />
      <Text style={[ni.suffix, { color: theme.textSecondary }]}>{suffix}</Text>
    </View>
  </View>
);
const ni = StyleSheet.create({
  wrap:   { flex: 1 },
  label:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  row:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.md, overflow: 'hidden', paddingRight: SPACING.sm },
  input:  { flex: 1, borderWidth: 0 },
  suffix: { fontSize: FONT_SIZES.sm, fontWeight: '600' },
});

// ─── Section row header ───────────────────────────────────────────────────────
const SectionIcon = ({ ionicon, color, bg }) => (
  <View style={[s.sectionIcon, { backgroundColor: bg }]}>
    <Ionicons name={ionicon} size={18} color={color} />
  </View>
);

// ═════════════════════════════════════════════════════════════════════════════
// EDIT DEVICE MODAL
// ═════════════════════════════════════════════════════════════════════════════
const EditDeviceModal = ({ visible, device, onClose, onSaved, theme }) => {
  const [form,    setForm]    = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (visible && device) {
      setForm({
        device_id:          device.device_id          || '',
        name:               device.name               || '',
        target_temp:        device.target_temp        != null ? String(device.target_temp)        : '',
        target_humidity:    device.target_humidity    != null ? String(device.target_humidity)    : '',
        threshold_temp:     device.threshold_temp     != null ? String(device.threshold_temp)     : '',
        threshold_humidity: device.threshold_humidity != null ? String(device.threshold_humidity) : '',
      });
      setError('');
    }
  }, [visible, device]);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Device name is required.'); return; }

    setLoading(true);
    const updates = {
      name:               form.name.trim(),
      target_temp:        numericField(form.target_temp),
      target_humidity:    numericField(form.target_humidity),
      threshold_temp:     numericField(form.threshold_temp),
      threshold_humidity: numericField(form.threshold_humidity),
    };

    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 400));
      onSaved({ ...device, ...updates });
      setLoading(false);
      onClose();
      return;
    }

    const { data, error: updateError } = await updateDevice(device.id, updates);
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    onSaved(data);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ed.overlay} onPress={onClose}>
        <Pressable style={[ed.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Handle bar */}
            <View style={[ed.handle, { backgroundColor: theme.border }]} />

            {/* Header */}
            <View style={ed.header}>
              <View style={[ed.headerIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="create-outline" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ed.headerTitle, { color: theme.text }]}>Edit Device</Text>
                <Text style={[ed.headerSub, { color: theme.textMuted }]}>{device?.device_id}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={ed.closeBtn}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[ed.divider, { backgroundColor: theme.divider }]} />

            {error ? (
              <View style={[ed.errorBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
                <Ionicons name="warning-outline" size={14} color={theme.danger} />
                <Text style={[ed.errorText, { color: theme.danger }]}>{error}</Text>
              </View>
            ) : null}

            {/* Name */}
            <Text style={[ed.groupLabel, { color: theme.textMuted }]}>Device Name</Text>
            <Input
              value={form.name}
              onChangeText={set('name')}
              placeholder="e.g. Freezer Unit A"
              autoCapitalize="words"
            />

            {/* Target values */}
            <View style={ed.groupHeader}>
              <Ionicons name="flag-outline" size={14} color={theme.primary} />
              <Text style={[ed.groupLabel, { color: theme.textMuted, marginBottom: 0 }]}>Target Values</Text>
            </View>
            <View style={ed.twoCol}>
              <NumInput label="Target Temp" value={form.target_temp}
                onChangeText={set('target_temp')} suffix="°C"
                placeholder="-18" theme={theme} />
              <NumInput label="Target Humidity" value={form.target_humidity}
                onChangeText={set('target_humidity')} suffix="%"
                placeholder="60" theme={theme} />
            </View>

            {/* Threshold values */}
            <View style={ed.groupHeader}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.warning} />
              <Text style={[ed.groupLabel, { color: theme.textMuted, marginBottom: 0 }]}>Tolerance (±offset from target)</Text>
            </View>
            <View style={ed.twoCol}>
              <NumInput label="Temp ± offset" value={form.threshold_temp}
                onChangeText={set('threshold_temp')} suffix="°C"
                placeholder="3" theme={theme} />
              <NumInput label="Humidity ± offset" value={form.threshold_humidity}
                onChangeText={set('threshold_humidity')} suffix="%"
                placeholder="10" theme={theme} />
            </View>
            {/* Live range preview */}
            {(form.target_temp !== '' || form.target_humidity !== '') && (
              <View style={[ed.rangePreview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
                <View style={{ flex: 1 }}>
                  {form.target_temp !== '' && form.threshold_temp !== '' && !isNaN(parseFloat(form.target_temp)) && !isNaN(parseFloat(form.threshold_temp)) && (
                    <Text style={[ed.rangeText, { color: theme.textSecondary }]}>
                      Temp alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_temp) - Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                        {' – '}
                        {(parseFloat(form.target_temp) + Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                      </Text>
                    </Text>
                  )}
                  {form.target_humidity !== '' && form.threshold_humidity !== '' && !isNaN(parseFloat(form.target_humidity)) && !isNaN(parseFloat(form.threshold_humidity)) && (
                    <Text style={[ed.rangeText, { color: theme.textSecondary }]}>
                      Humidity alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_humidity) - Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                        {' – '}
                        {(parseFloat(form.target_humidity) + Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            )}

            <Button title="Save Changes" onPress={handleSave} loading={loading}
              style={{ marginTop: SPACING.md }} />
            <Button title="Cancel" variant="ghost" onPress={onClose}
              style={{ marginTop: SPACING.xs }} />

          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const ed = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    borderWidth: 1, padding: SPACING.xl, maxHeight: '90%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  headerIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700' },
  headerSub:   { fontSize: FONT_SIZES.xs, marginTop: 2 },
  closeBtn:    { padding: SPACING.xs },
  divider:     { height: 1, marginBottom: SPACING.lg },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md,
  },
  errorText:   { fontSize: FONT_SIZES.sm, fontWeight: '500', flex: 1 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.md, marginBottom: SPACING.xs },
  groupLabel:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: SPACING.xs },
  twoCol:      { flexDirection: 'row', gap: SPACING.sm },
  rangePreview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  rangeText: { fontSize: FONT_SIZES.xs, lineHeight: 18, marginTop: 2 },
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
const AddDeviceScreen = () => {
  const { theme } = useTheme();
  const { user }  = useAuth();

  const [form,            setForm]           = useState(emptyForm());
  const [loading,         setLoading]        = useState(false);
  const [error,           setError]          = useState('');
  const [success,         setSuccess]        = useState('');
  const [existingDevices, setExistingDevices]= useState([]);
  const [editingDevice,   setEditingDevice]  = useState(null);
  const [showEditModal,   setShowEditModal]  = useState(false);

  // ── Auto-clear banners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  // ── Fetch devices ──────────────────────────────────────────────────────────
  const fetchDevices = async () => {
    if (USE_MOCK) {
      setExistingDevices([
        {
          id: 'mock-1', device_id: 'THM-001', name: 'Freezer Unit A',
          target_temp: -18, target_humidity: 60,
          threshold_temp: -15, threshold_humidity: 80,
          connected_at: new Date().toISOString(),
        },
        {
          id: 'mock-2', device_id: 'THM-002', name: 'Cold Room B',
          target_temp: -20, target_humidity: 55,
          threshold_temp: -17, threshold_humidity: 75,
          connected_at: new Date().toISOString(),
        },
      ]);
      return;
    }
    const { data } = await getUserDevices(user.id);
    setExistingDevices(data || []);
  };

  useEffect(() => { fetchDevices(); }, []);

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) return;
    const channel = subscribeToDevices(() => fetchDevices());
    return () => channel.unsubscribe();
  }, []);

  const setField = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  // ── Add device ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    setError(''); setSuccess('');
    const trimmedId = form.device_id.trim().toUpperCase();

    if (!trimmedId) { setError('Device ID is required.'); return; }
    if (!/^[A-Z0-9\-_]+$/.test(trimmedId)) {
      setError('Device ID may only contain letters, numbers, dashes, and underscores.');
      return;
    }
    if (!form.name.trim()) { setError('Device name is required.'); return; }

    setLoading(true);
    try {
      const fields = {
        device_id:          trimmedId,
        name:               form.name.trim(),
        target_temp:        numericField(form.target_temp),
        target_humidity:    numericField(form.target_humidity),
        threshold_temp:     numericField(form.threshold_temp),
        threshold_humidity: numericField(form.threshold_humidity),
      };

      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 500));
        setExistingDevices(prev => [
          { id: String(Date.now()), ...fields, user_id: 'mock', connected_at: new Date().toISOString() },
          ...prev,
        ]);
        setForm(emptyForm());
        setSuccess(`Device "${trimmedId}" registered!`);
        return;
      }

      const { error: addError } = await addDevice(user.id, fields);
      if (addError) {
        setError(
          addError.code === '23505' || addError.message.includes('unique')
            ? `Device ID "${trimmedId}" is already registered.`
            : addError.message
        );
      } else {
        setForm(emptyForm());
        setSuccess(`Device "${trimmedId}" registered successfully!`);
        fetchDevices();
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Edit saved callback ────────────────────────────────────────────────────
  const handleEditSaved = (updated) => {
    setExistingDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    setSuccess(`Device "${updated.device_id}" updated successfully!`);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = (device) => {
    const confirm = async () => {
      if (USE_MOCK) {
        setExistingDevices(prev => prev.filter(d => d.id !== device.id));
        return;
      }
      const { error: delError } = await deleteDevice(device.id);
      if (delError) setError(delError.message);
      else fetchDevices();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${device.device_id}" from your account?`)) confirm();
    } else {
      Alert.alert(
        'Remove Device',
        `Remove "${device.name || device.device_id}" from your account? This will delete all its sensor readings.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: confirm }]
      );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

          {/* ── Global banners ── */}
          {error ? (
            <View style={[styles.banner, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
              <Ionicons name="warning-outline" size={16} color={theme.danger} />
              <Text style={[styles.bannerText, { color: theme.danger }]}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={[styles.banner, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.success} />
              <Text style={[styles.bannerText, { color: theme.success }]}>{success}</Text>
            </View>
          ) : null}

          {/* ══ REGISTER FORM ══ */}
          <Card style={styles.formCard}>
            {/* Title */}
            <View style={styles.cardTitleRow}>
              <SectionIcon ionicon="add-circle-outline" color={theme.primary} bg={theme.primaryLight} />
              <View>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Register New Device</Text>
                <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                  Fill in the details for your sensor
                </Text>
              </View>
            </View>
            <Divider />

            {/* Device ID + Name */}
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Device ID *"
                  value={form.device_id}
                  onChangeText={(v) => setField('device_id')(v.toUpperCase())}
                  placeholder="e.g. THM-001"
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Device Name *"
                  value={form.name}
                  onChangeText={setField('name')}
                  placeholder="e.g. Freezer A"
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Target values */}
            <View style={styles.groupHeader}>
              <Ionicons name="flag-outline" size={14} color={theme.primary} />
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>Target Values</Text>
            </View>
            <View style={styles.twoCol}>
              <NumInput label="Target Temp" value={form.target_temp}
                onChangeText={setField('target_temp')} suffix="°C"
                placeholder="-18" theme={theme} />
              <NumInput label="Target Humidity" value={form.target_humidity}
                onChangeText={setField('target_humidity')} suffix="%"
                placeholder="60" theme={theme} />
            </View>

            {/* Threshold values */}
            <View style={styles.groupHeader}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.warning} />
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>Tolerance (±offset from target)</Text>
            </View>
            <View style={styles.twoCol}>
              <NumInput label="Temp ± offset" value={form.threshold_temp}
                onChangeText={setField('threshold_temp')} suffix="°C"
                placeholder="3" theme={theme} />
              <NumInput label="Humidity ± offset" value={form.threshold_humidity}
                onChangeText={setField('threshold_humidity')} suffix="%"
                placeholder="10" theme={theme} />
            </View>

            {/* Live range preview */}
            {(form.target_temp !== '' || form.target_humidity !== '') && (
              <View style={[styles.rangePreview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
                <View style={{ flex: 1 }}>
                  {form.target_temp !== '' && form.threshold_temp !== '' && !isNaN(parseFloat(form.target_temp)) && !isNaN(parseFloat(form.threshold_temp)) && (
                    <Text style={[styles.rangeText, { color: theme.textSecondary }]}>
                      Temp alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_temp) - Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                        {' – '}
                        {(parseFloat(form.target_temp) + Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                      </Text>
                    </Text>
                  )}
                  {form.target_humidity !== '' && form.threshold_humidity !== '' && !isNaN(parseFloat(form.target_humidity)) && !isNaN(parseFloat(form.threshold_humidity)) && (
                    <Text style={[styles.rangeText, { color: theme.textSecondary }]}>
                      Humidity alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_humidity) - Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                        {' – '}
                        {(parseFloat(form.target_humidity) + Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            )}

            <Button title="Register Device" onPress={handleAdd} loading={loading}
              style={{ marginTop: SPACING.md }} />

            {/* Hint */}
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Device ID is printed on the back of your sensor. Fields marked * are required.
              </Text>
            </View>
          </Card>

          {/* ══ DEVICE LIST ══ */}
          {existingDevices.length > 0 && (
            <Card>
              <View style={styles.cardTitleRow}>
                <SectionIcon ionicon="hardware-chip" color={theme.primary} bg={theme.primaryLight} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  My Devices ({existingDevices.length})
                </Text>
              </View>
              <Divider />

              {existingDevices.map((device, index) => (
                <View key={device.id}>
                  <View style={styles.deviceRow}>
                    {/* Left icon */}
                    <View style={[styles.deviceIconCircle, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="hardware-chip-outline" size={20} color={theme.primary} />
                    </View>

                    {/* Info block */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deviceName, { color: theme.text }]}>
                        {device.name || device.device_id}
                      </Text>
                      <Text style={[styles.deviceId, { color: theme.textMuted }]}>
                        ID: {device.device_id}
                      </Text>

                      {/* Target / threshold chips */}
                      <View style={styles.chipRow}>
                        {device.target_temp != null && (
                          <View style={[styles.chip, { backgroundColor: theme.primaryLight }]}>
                            <Ionicons name="flag-outline" size={10} color={theme.primary} />
                            <Text style={[styles.chipText, { color: theme.primary }]}>
                              {device.target_temp}°C
                            </Text>
                          </View>
                        )}
                        {device.target_humidity != null && (
                          <View style={[styles.chip, { backgroundColor: theme.primaryLight }]}>
                            <Ionicons name="water-outline" size={10} color={theme.primary} />
                            <Text style={[styles.chipText, { color: theme.primary }]}>
                              {device.target_humidity}%
                            </Text>
                          </View>
                        )}
                        {device.threshold_temp != null && (
                          <View style={[styles.chip, { backgroundColor: theme.warningBg }]}>
                            <Ionicons name="alert-circle-outline" size={10} color={theme.warning} />
                            <Text style={[styles.chipText, { color: theme.warning }]}>
                              {device.threshold_temp}°C
                            </Text>
                          </View>
                        )}
                        {device.threshold_humidity != null && (
                          <View style={[styles.chip, { backgroundColor: theme.warningBg }]}>
                            <Ionicons name="alert-circle-outline" size={10} color={theme.warning} />
                            <Text style={[styles.chipText, { color: theme.warning }]}>
                              {device.threshold_humidity}%
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Edit / Delete buttons */}
                    <View style={styles.actionBtns}>
                      <TouchableOpacity
                        onPress={() => { setEditingDevice(device); setShowEditModal(true); }}
                        style={[styles.iconBtn, { borderColor: theme.primary }]}
                      >
                        <Ionicons name="create-outline" size={16} color={theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(device)}
                        style={[styles.iconBtn, { borderColor: theme.danger }]}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.danger} />
                      </TouchableOpacity>
                    </View>
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

      {/* Edit modal */}
      <EditDeviceModal
        visible={showEditModal}
        device={editingDevice}
        onClose={() => { setShowEditModal(false); setEditingDevice(null); }}
        onSaved={handleEditSaved}
        theme={theme}
      />
    </KeyboardAvoidingView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s  = StyleSheet.create({
  sectionIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});

const styles = StyleSheet.create({
  container: { padding: SPACING.base, paddingTop: SPACING.lg, paddingBottom: 80 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  bannerText: { fontSize: FONT_SIZES.sm, fontWeight: '500', flex: 1 },

  formCard: { marginBottom: SPACING.base },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  cardTitle:    { fontSize: FONT_SIZES.base, fontWeight: '700' },
  cardSub:      { fontSize: FONT_SIZES.xs, marginTop: 2 },

  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.md, marginBottom: SPACING.xs },
  groupLabel:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },

  twoCol: { flexDirection: 'row', gap: SPACING.sm },

  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, marginTop: SPACING.sm },
  hint:    { fontSize: FONT_SIZES.xs, lineHeight: 18, flex: 1 },

  rangePreview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  rangeText: { fontSize: FONT_SIZES.xs, lineHeight: 18, marginTop: 2 },

  // Device list
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  deviceIconCircle: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  deviceName: { fontSize: FONT_SIZES.base, fontWeight: '700' },
  deviceId:   { fontSize: FONT_SIZES.xs, marginTop: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACING.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: SPACING.xs, paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  chipText: { fontSize: 10, fontWeight: '700' },

  actionBtns: { flexDirection: 'column', gap: SPACING.xs },
  iconBtn: {
    width: 34, height: 34, borderRadius: RADIUS.md,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  innerDivider: { height: 1, marginVertical: SPACING.xs },
});

export default AddDeviceScreen;
