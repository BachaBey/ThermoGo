import React, { useState, useEffect, useRef } from 'react';
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

// ─── Try to import Camera — gracefully fails on web ──────────────────────────
let CameraView       = null;
let useCameraPermissions = null;
try {
  const cam = require('expo-camera');
  CameraView           = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch (_) {}

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

const numericField = (v) =>
  v === '' || v === null || v === undefined ? null : Number(v);

const sanitizeNum = (v) => {
  const cleaned    = v.replace(/[^0-9.\-]/g, '');
  const withMinus  = cleaned.startsWith('-');
  const abs        = withMinus ? cleaned.slice(1) : cleaned;
  const dotParts   = abs.split('.');
  const sanitized  = dotParts[0] + (dotParts.length > 1 ? '.' + dotParts.slice(1).join('') : '');
  return (withMinus ? '-' : '') + sanitized;
};

// ─── Labelled numeric input ───────────────────────────────────────────────────
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

const SectionIcon = ({ ionicon, color, bg }) => (
  <View style={[s.sectionIcon, { backgroundColor: bg }]}>
    <Ionicons name={ionicon} size={18} color={color} />
  </View>
);

// ═════════════════════════════════════════════════════════════════════════════
// QR SCANNER MODAL
// ═════════════════════════════════════════════════════════════════════════════
const QrScanModal = ({ visible, onClose, onScanned, theme }) => {
  const [permission, requestPermission] = useCameraPermissions
    ? useCameraPermissions()
    : [null, () => {}];
  const [scanned, setScanned] = useState(false);
  const [error,   setError]   = useState('');

  // Reset on open
  useEffect(() => {
    if (visible) { setScanned(false); setError(''); }
  }, [visible]);

  const handleBarcode = ({ data }) => {
    if (scanned) return;
    setScanned(true);

    // Validate: Device ID must be alphanumeric + dashes/underscores
    const cleaned = data.trim().toUpperCase();
    if (!/^[A-Z0-9\-_]+$/.test(cleaned)) {
      setError(`Invalid QR code: "${data}". Expected a device ID like THM-001.`);
      return;
    }

    onScanned(cleaned);
    onClose();
  };

  const cameraAvailable = !!CameraView;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {/* Header overlay */}
        <View style={qr.topBar}>
          <TouchableOpacity onPress={onClose} style={qr.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={qr.topTitle}>Scan Device QR Code</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Camera or fallback */}
        {!cameraAvailable ? (
          <View style={qr.fallback}>
            <Ionicons name="camera-off-outline" size={64} color="#666" />
            <Text style={qr.fallbackTitle}>Camera not available</Text>
            <Text style={qr.fallbackSub}>
              Install expo-camera:{'\n'}
              <Text style={{ fontWeight: '700', color: '#aaa' }}>
                npx expo install expo-camera
              </Text>
            </Text>
          </View>
        ) : !permission?.granted ? (
          <View style={qr.fallback}>
            <Ionicons name="camera-outline" size={64} color="#666" />
            <Text style={qr.fallbackTitle}>Camera permission needed</Text>
            <Text style={qr.fallbackSub}>
              Allow camera access to scan your device QR code
            </Text>
            <TouchableOpacity onPress={requestPermission} style={qr.permBtn}>
              <Text style={qr.permBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarcode}
            />

            {/* Scanning frame overlay */}
            <View style={qr.overlay} pointerEvents="none">
              {/* Dark corners */}
              <View style={qr.overlayRow}>
                <View style={[qr.overlayCell, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
                <View style={qr.frameTop} />
                <View style={[qr.overlayCell, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
              </View>
              <View style={qr.frameMiddle}>
                <View style={[qr.frameSide, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
                {/* Corner brackets */}
                <View style={qr.frameSquare}>
                  <View style={[qr.corner, qr.cornerTL, { borderColor: theme.primary }]} />
                  <View style={[qr.corner, qr.cornerTR, { borderColor: theme.primary }]} />
                  <View style={[qr.corner, qr.cornerBL, { borderColor: theme.primary }]} />
                  <View style={[qr.corner, qr.cornerBR, { borderColor: theme.primary }]} />
                </View>
                <View style={[qr.frameSide, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
              </View>
              <View style={qr.overlayRow}>
                <View style={[qr.overlayCell, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
                <View style={qr.frameBottom} />
                <View style={[qr.overlayCell, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
              </View>
            </View>
          </View>
        )}

        {/* Bottom instructions */}
        <View style={[qr.bottomBar, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
          {error ? (
            <>
              <Ionicons name="warning-outline" size={20} color="#f87171" />
              <Text style={[qr.bottomText, { color: '#f87171' }]}>{error}</Text>
              <TouchableOpacity onPress={() => { setScanned(false); setError(''); }} style={qr.retryBtn}>
                <Text style={qr.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : scanned ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
              <Text style={[qr.bottomText, { color: '#4ade80' }]}>Device ID scanned!</Text>
            </>
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
              <Text style={qr.bottomText}>
                Point at the QR code on your sensor
              </Text>
            </>
          )}
        </View>

      </View>
    </Modal>
  );
};

const FRAME_SIZE = 240;
const qr = StyleSheet.create({
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: SPACING.base, paddingBottom: SPACING.base, backgroundColor: 'rgba(0,0,0,0.7)', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle:     { color: '#fff', fontSize: FONT_SIZES.base, fontWeight: '700' },

  fallback:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  fallbackTitle:{ color: '#fff', fontSize: FONT_SIZES.lg, fontWeight: '700', textAlign: 'center' },
  fallbackSub:  { color: '#888', fontSize: FONT_SIZES.sm, textAlign: 'center', lineHeight: 22 },
  permBtn:      { marginTop: SPACING.md, backgroundColor: '#3b82f6', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  permBtnText:  { color: '#fff', fontWeight: '700' },

  // Frame overlay
  overlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlayRow:   { flexDirection: 'row', height: 140 },
  overlayCell:  { flex: 1 },
  frameTop:     { width: FRAME_SIZE },
  frameBottom:  { width: FRAME_SIZE },
  frameMiddle:  { flexDirection: 'row', height: FRAME_SIZE },
  frameSide:    { flex: 1 },
  frameSquare:  { width: FRAME_SIZE, height: FRAME_SIZE },

  // Corner brackets
  corner:       { position: 'absolute', width: 28, height: 28, borderWidth: 4 },
  cornerTL:     { top: 0,    left: 0,    borderBottomWidth: 0, borderRightWidth: 0,  borderTopLeftRadius: 4 },
  cornerTR:     { top: 0,    right: 0,   borderBottomWidth: 0, borderLeftWidth: 0,   borderTopRightRadius: 4 },
  cornerBL:     { bottom: 0, left: 0,    borderTopWidth: 0,    borderRightWidth: 0,  borderBottomLeftRadius: 4 },
  cornerBR:     { bottom: 0, right: 0,   borderTopWidth: 0,    borderLeftWidth: 0,   borderBottomRightRadius: 4 },

  bottomBar:    { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  bottomText:   { color: '#fff', fontSize: FONT_SIZES.sm, textAlign: 'center', fontWeight: '500' },
  retryBtn:     { marginTop: SPACING.xs, borderWidth: 1, borderColor: '#f87171', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  retryText:    { color: '#f87171', fontWeight: '700', fontSize: FONT_SIZES.xs },
});

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
      setLoading(false); onClose(); return;
    }
    const { data, error: updateError } = await updateDevice(device.id, updates);
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    onSaved(data); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ed.overlay} onPress={onClose}>
        <Pressable style={[ed.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[ed.handle, { backgroundColor: theme.border }]} />
            <View style={ed.header}>
              <View style={[ed.headerIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="create-outline" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ed.headerTitle, { color: theme.text }]}>Edit Device</Text>
                <Text style={[ed.headerSub, { color: theme.textMuted }]}>{device?.name || device?.device_id}</Text>
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

            <Input label="Device Name *" value={form.name} onChangeText={set('name')} placeholder="e.g. Freezer Unit A" autoCapitalize="words" />

            <View style={ed.groupHeader}>
              <Ionicons name="flag-outline" size={14} color={theme.primary} />
              <Text style={[ed.groupLabel, { color: theme.textMuted, marginBottom: 0 }]}>Target Values</Text>
            </View>
            <View style={ed.twoCol}>
              <NumInput label="Target Temp"     value={form.target_temp}     onChangeText={set('target_temp')}     suffix="°C" placeholder="-18" theme={theme} />
              <NumInput label="Target Humidity" value={form.target_humidity} onChangeText={set('target_humidity')} suffix="%" placeholder="60"  theme={theme} />
            </View>

            <View style={ed.groupHeader}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.warning} />
              <Text style={[ed.groupLabel, { color: theme.textMuted, marginBottom: 0 }]}>Tolerance (±offset from target)</Text>
            </View>
            <View style={ed.twoCol}>
              <NumInput label="Temp ± offset"     value={form.threshold_temp}     onChangeText={set('threshold_temp')}     suffix="°C" placeholder="3"  theme={theme} />
              <NumInput label="Humidity ± offset" value={form.threshold_humidity} onChangeText={set('threshold_humidity')} suffix="%" placeholder="10" theme={theme} />
            </View>

            {(form.target_temp !== '' || form.target_humidity !== '') && (
              <View style={[ed.rangePreview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
                <View style={{ flex: 1 }}>
                  {form.target_temp !== '' && form.threshold_temp !== '' && !isNaN(parseFloat(form.target_temp)) && !isNaN(parseFloat(form.threshold_temp)) && (
                    <Text style={[ed.rangeText, { color: theme.textSecondary }]}>
                      Temp alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_temp) - Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C – {(parseFloat(form.target_temp) + Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                      </Text>
                    </Text>
                  )}
                  {form.target_humidity !== '' && form.threshold_humidity !== '' && !isNaN(parseFloat(form.target_humidity)) && !isNaN(parseFloat(form.threshold_humidity)) && (
                    <Text style={[ed.rangeText, { color: theme.textSecondary }]}>
                      Humidity alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_humidity) - Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}% – {(parseFloat(form.target_humidity) + Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            )}

            <Button title="Save Changes" onPress={handleSave} loading={loading} style={{ marginTop: SPACING.md }} />
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: SPACING.xs }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const ed = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.xl, maxHeight: '90%' },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  header:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  headerIcon:  { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700' },
  headerSub:   { fontSize: FONT_SIZES.xs, marginTop: 2 },
  closeBtn:    { padding: SPACING.xs },
  divider:     { height: 1, marginBottom: SPACING.lg },
  errorBox:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  errorText:   { fontSize: FONT_SIZES.sm, fontWeight: '500', flex: 1 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.md, marginBottom: SPACING.xs },
  groupLabel:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: SPACING.xs },
  twoCol:      { flexDirection: 'row', gap: SPACING.sm },
  rangePreview:{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm },
  rangeText:   { fontSize: FONT_SIZES.xs, lineHeight: 18, marginTop: 2 },
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
  const [showQrModal,     setShowQrModal]    = useState(false);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  const fetchDevices = async () => {
    if (USE_MOCK) {
      setExistingDevices([
        { id: 'mock-1', device_id: 'THM-001', name: 'Freezer Unit A', target_temp: -18, target_humidity: 60, threshold_temp: 3, threshold_humidity: 10, connected_at: new Date().toISOString() },
        { id: 'mock-2', device_id: 'THM-002', name: 'Cold Room B',    target_temp: -20, target_humidity: 55, threshold_temp: 3, threshold_humidity: 10, connected_at: new Date().toISOString() },
      ]);
      return;
    }
    const { data } = await getUserDevices(user.id);
    setExistingDevices(data || []);
  };

  useEffect(() => { fetchDevices(); }, []);

  useEffect(() => {
    if (USE_MOCK) return;
    const channel = subscribeToDevices(() => fetchDevices());
    return () => channel.unsubscribe();
  }, []);

  const setField = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const handleQrScanned = (deviceId) => {
    setForm(f => ({ ...f, device_id: deviceId }));
    setSuccess(`Device ID "${deviceId}" scanned successfully!`);
  };

  const handleAdd = async () => {
    setError(''); setSuccess('');
    const trimmedId = form.device_id.trim().toUpperCase();
    if (!trimmedId)        { setError('Please scan the QR code or enter a Device ID.'); return; }
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
        setExistingDevices(prev => [{ id: String(Date.now()), ...fields, user_id: 'mock', connected_at: new Date().toISOString() }, ...prev]);
        setForm(emptyForm());
        setSuccess(`Device "${trimmedId}" registered!`);
        return;
      }

      const { error: addError } = await addDevice(user.id, fields);
      if (addError) {
        setError(
          addError.code === '23505' || addError.message?.includes('unique')
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

  const handleEditSaved = (updated) => {
    setExistingDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    setSuccess(`"${updated.name || updated.device_id}" updated successfully!`);
  };

  const handleDelete = (device) => {
    const confirm = async () => {
      if (USE_MOCK) { setExistingDevices(prev => prev.filter(d => d.id !== device.id)); return; }
      const { error: delError } = await deleteDevice(device.id);
      if (delError) setError(delError.message); else fetchDevices();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${device.name || device.device_id}"?`)) confirm();
    } else {
      Alert.alert(
        'Remove Device',
        `Remove "${device.name || device.device_id}" from your account?`,
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

          {/* Banners */}
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
            <View style={styles.cardTitleRow}>
              <SectionIcon ionicon="add-circle-outline" color={theme.primary} bg={theme.primaryLight} />
              <View>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Register New Device</Text>
                <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                  Scan the QR code on your sensor
                </Text>
              </View>
            </View>
            <Divider />

            {/* ── Device ID row: QR button + field ── */}
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>DEVICE ID *</Text>
            <View style={styles.deviceIdRow}>

              {/* QR Scan button */}
              <TouchableOpacity
                onPress={() => setShowQrModal(true)}
                style={[styles.qrBtn, { backgroundColor: theme.primary }]}
              >
                <Ionicons name="qr-code-outline" size={20} color="#fff" />
                <Text style={styles.qrBtnText}>Scan QR</Text>
              </TouchableOpacity>

              {/* ID display — chip if filled, input if empty */}
              <View style={[
                styles.deviceIdInput,
                { borderColor: form.device_id ? theme.primary : theme.border, backgroundColor: theme.surfaceAlt },
              ]}>
                {form.device_id ? (
                  <View style={[styles.idChip, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="hardware-chip-outline" size={14} color={theme.primary} />
                    <Text style={[styles.idChipText, { color: theme.primary }]} numberOfLines={1}>
                      {form.device_id}
                    </Text>
                    <TouchableOpacity onPress={() => setField('device_id')('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Input
                    value={form.device_id}
                    onChangeText={(v) => setField('device_id')(v.toUpperCase())}
                    placeholder="Or type manually: THM-001"
                    autoCapitalize="characters"
                    noLabel
                    style={{ borderWidth: 0, backgroundColor: 'transparent' }}
                  />
                )}
              </View>
            </View>

            {/* Device Name */}
            <Input
              label="Device Name *"
              value={form.name}
              onChangeText={setField('name')}
              placeholder="e.g. Freezer Unit A"
              autoCapitalize="words"
            />

            {/* Target values */}
            <View style={styles.groupHeader}>
              <Ionicons name="flag-outline" size={14} color={theme.primary} />
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>Target Values</Text>
            </View>
            <View style={styles.twoCol}>
              <NumInput label="Target Temp"     value={form.target_temp}     onChangeText={setField('target_temp')}     suffix="°C" placeholder="-18" theme={theme} />
              <NumInput label="Target Humidity" value={form.target_humidity} onChangeText={setField('target_humidity')} suffix="%"  placeholder="60"  theme={theme} />
            </View>

            {/* Tolerance */}
            <View style={styles.groupHeader}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.warning} />
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>Tolerance (±offset from target)</Text>
            </View>
            <View style={styles.twoCol}>
              <NumInput label="Temp ± offset"     value={form.threshold_temp}     onChangeText={setField('threshold_temp')}     suffix="°C" placeholder="3"  theme={theme} />
              <NumInput label="Humidity ± offset" value={form.threshold_humidity} onChangeText={setField('threshold_humidity')} suffix="%"  placeholder="10" theme={theme} />
            </View>

            {/* Range preview */}
            {(form.target_temp !== '' || form.target_humidity !== '') && (
              <View style={[styles.rangePreview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
                <View style={{ flex: 1 }}>
                  {form.target_temp !== '' && form.threshold_temp !== '' && !isNaN(parseFloat(form.target_temp)) && !isNaN(parseFloat(form.threshold_temp)) && (
                    <Text style={[styles.rangeText, { color: theme.textSecondary }]}>
                      Temp alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_temp) - Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C – {(parseFloat(form.target_temp) + Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                      </Text>
                    </Text>
                  )}
                  {form.target_humidity !== '' && form.threshold_humidity !== '' && !isNaN(parseFloat(form.target_humidity)) && !isNaN(parseFloat(form.threshold_humidity)) && (
                    <Text style={[styles.rangeText, { color: theme.textSecondary }]}>
                      Humidity alert if outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_humidity) - Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}% – {(parseFloat(form.target_humidity) + Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            )}

            <Button title="Register Device" onPress={handleAdd} loading={loading} style={{ marginTop: SPACING.md }} />

            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Scan the QR code sticker on your sensor to auto-fill the Device ID. You can also type it manually. Fields marked * are required.
              </Text>
            </View>
          </Card>

          {/* ══ DEVICE LIST ══ */}
          {existingDevices.length > 0 && (
            <Card>
              <View style={styles.cardTitleRow}>
                <SectionIcon ionicon="hardware-chip" color={theme.primary} bg={theme.primaryLight} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>My Devices ({existingDevices.length})</Text>
              </View>
              <Divider />
              {existingDevices.map((device, index) => (
                <View key={device.id}>
                  <View style={styles.deviceRow}>
                    <View style={[styles.deviceIconCircle, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="hardware-chip-outline" size={20} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deviceName, { color: theme.text }]}>{device.name || device.device_id}</Text>
                      <Text style={[styles.deviceId, { color: theme.textMuted }]}>ID: {device.device_id}</Text>
                      <View style={styles.chipRow}>
                        {device.target_temp      != null && <View style={[styles.chip, { backgroundColor: theme.primaryLight }]}><Ionicons name="flag-outline"         size={10} color={theme.primary} /><Text style={[styles.chipText, { color: theme.primary  }]}>{device.target_temp}°C</Text></View>}
                        {device.target_humidity  != null && <View style={[styles.chip, { backgroundColor: theme.primaryLight }]}><Ionicons name="water-outline"        size={10} color={theme.primary} /><Text style={[styles.chipText, { color: theme.primary  }]}>{device.target_humidity}%</Text></View>}
                        {device.threshold_temp   != null && <View style={[styles.chip, { backgroundColor: theme.warningBg   }]}><Ionicons name="alert-circle-outline"  size={10} color={theme.warning} /><Text style={[styles.chipText, { color: theme.warning  }]}>±{device.threshold_temp}°C</Text></View>}
                        {device.threshold_humidity != null && <View style={[styles.chip, { backgroundColor: theme.warningBg }]}><Ionicons name="alert-circle-outline"  size={10} color={theme.warning} /><Text style={[styles.chipText, { color: theme.warning  }]}>±{device.threshold_humidity}%</Text></View>}
                      </View>
                    </View>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity onPress={() => { setEditingDevice(device); setShowEditModal(true); }} style={[styles.iconBtn, { borderColor: theme.primary }]}>
                        <Ionicons name="create-outline" size={16} color={theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(device)} style={[styles.iconBtn, { borderColor: theme.danger }]}>
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

      {/* QR Scanner */}
      {useCameraPermissions && (
        <QrScanModal
          visible={showQrModal}
          onClose={() => setShowQrModal(false)}
          onScanned={handleQrScanned}
          theme={theme}
        />
      )}

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

const s = StyleSheet.create({
  sectionIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});

const styles = StyleSheet.create({
  container:    { padding: SPACING.base, paddingTop: SPACING.lg, paddingBottom: 80 },
  banner:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  bannerText:   { fontSize: FONT_SIZES.sm, fontWeight: '500', flex: 1 },
  formCard:     { marginBottom: SPACING.base },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  cardTitle:    { fontSize: FONT_SIZES.base, fontWeight: '700' },
  cardSub:      { fontSize: FONT_SIZES.xs, marginTop: 2 },

  fieldLabel:     { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  deviceIdRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  qrBtn:          { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md },
  qrBtnText:      { color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.sm },
  deviceIdInput:  { flex: 1, borderWidth: 1.5, borderRadius: RADIUS.md, minHeight: 44, justifyContent: 'center', overflow: 'hidden' },
  idChip:         { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm, margin: SPACING.xs },
  idChipText:     { fontWeight: '700', fontSize: FONT_SIZES.sm, flex: 1 },

  groupHeader:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.md, marginBottom: SPACING.xs },
  groupLabel:   { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  twoCol:       { flexDirection: 'row', gap: SPACING.sm },
  hintRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, marginTop: SPACING.sm },
  hint:         { fontSize: FONT_SIZES.xs, lineHeight: 18, flex: 1 },
  rangePreview: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm },
  rangeText:    { fontSize: FONT_SIZES.xs, lineHeight: 18, marginTop: 2 },

  deviceRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  deviceIconCircle: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  deviceName:       { fontSize: FONT_SIZES.base, fontWeight: '700' },
  deviceId:         { fontSize: FONT_SIZES.xs, marginTop: 2 },
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACING.xs },
  chip:             { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACING.xs, paddingVertical: 2, borderRadius: RADIUS.sm },
  chipText:         { fontSize: 10, fontWeight: '700' },
  actionBtns:       { flexDirection: 'column', gap: SPACING.xs },
  iconBtn:          { width: 34, height: 34, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  innerDivider:     { height: 1, marginVertical: SPACING.xs },
});

export default AddDeviceScreen;
