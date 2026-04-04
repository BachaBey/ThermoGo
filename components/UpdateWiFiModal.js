import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Modal, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { Input } from './UI';
import { FONT_SIZES, SPACING, RADIUS } from '../styles/typography';

// ─── ESP config ───────────────────────────────────────────────────────────────
const ESP_HOST          = 'http://192.168.4.1';
const ESP_WIFI_ENDPOINT = `${ESP_HOST}/add_wifi`;  // POST → { ssid, password }
const FETCH_TIMEOUT_MS  = 8000;
const USE_MOCK          = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fetchWithTimeout = (url, options = {}, ms = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

const isWebHttps = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location.protocol === 'https:';

const openWifiSettings = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(
        'Cannot open native WiFi settings from the browser.\n\n' +
        'Please manually connect to ThermoGo-XXXX in your device WiFi settings, then return and tap "Already connected — Continue".'
      );
    }
    return;
  }

  if (Platform.OS === 'ios') {
    Linking.openURL('App-Prefs:WIFI').catch(() => Linking.openURL('app-settings:'));
  } else {
    Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() =>
      Linking.openURL('android.settings.WIFI_SETTINGS')
    );
  }
};

const sanitizeNum = (v) => {
  const cleaned   = v.replace(/[^0-9.\-]/g, '');
  const withMinus = cleaned.startsWith('-');
  const abs       = withMinus ? cleaned.slice(1) : cleaned;
  const dotParts  = abs.split('.');
  const sanitized = dotParts[0] + (dotParts.length > 1 ? '.' + dotParts.slice(1).join('') : '');
  return (withMinus ? '-' : '') + sanitized;
};

// ─── Step indicator ───────────────────────────────────────────────────────────
const StepDots = ({ current, total, primary }) => (
  <View style={sd.row}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={[
          sd.dot,
          i + 1 === current
            ? { backgroundColor: primary, width: 20 }
            : i + 1 < current
            ? { backgroundColor: primary, opacity: 0.4 }
            : { backgroundColor: '#e2e8f0' },
        ]}
      />
    ))}
  </View>
);
const sd = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: SPACING.lg },
  dot: { height: 6, width: 6, borderRadius: 3 },
});

// ═════════════════════════════════════════════════════════════════════════════
// UPDATE WIFI MODAL  — 3 steps
//  1. Instruction: go to WiFi settings, connect to ThermoGo-XXXX hotspot
//  2. Enter new home WiFi credentials
//  3. Result (success or error)
// ═════════════════════════════════════════════════════════════════════════════
const UpdateWiFiModal = ({ visible, device, onClose, onSuccess, theme }) => {
  const [step,       setStep]      = useState(1);
  const [ssid,       setSsid]      = useState('');
  const [password,   setPassword]  = useState('');
  const [showPass,   setShowPass]  = useState(false);
  const [sending,    setSending]   = useState(false);
  const [resultOk,   setResultOk]  = useState(false);
  const [resultMsg,  setResultMsg] = useState('');
  const appState = useRef(AppState.currentState);
  const primary  = theme.primary;

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setStep(1);
      setSsid('');
      setPassword('');
      setShowPass(false);
      setSending(false);
      setResultOk(false);
      setResultMsg('');
    }
  }, [visible]);

  // ── Listen for app returning to foreground on step 1 ──────────────────────
  // When user goes to WiFi settings and comes back, auto-advance to step 2
  useEffect(() => {
    if (!visible || step !== 1) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        // User came back — move to credentials step
        setStep(2);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [visible, step]);

  // ── Step 2 → 3: send WiFi credentials to ESP ──────────────────────────────
  const handleSendCredentials = async () => {
    if (!ssid.trim()) {
      setResultMsg('Please enter your WiFi network name.');
      return;
    }

    setSending(true);
    setResultMsg('');

    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 1500));
      setSending(false);
      setResultOk(true);
      setResultMsg(`Device is now connecting to "${ssid}".`);
      onSuccess?.();
      setStep(3);
      return;
    }

    try {
      if (isWebHttps()) {
        throw new Error(
          'Unable to connect to 192.168.4.1 from HTTPS context (browser security blocks mixed content).\n\n' +
          'Switch to a non-secure URL (http://) or use the mobile app on device (not browser), then retry.'
        );
      }

      const payload = {
        ssid: ssid.trim(),
        password,
      };

      const res = await fetchWithTimeout(
        ESP_WIFI_ENDPOINT,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        },
        8000
      );

      // ESP reboots immediately after saving — it may drop the connection
      // before sending a response. Both ok and abort are treated as success.
      setSending(false);
      setResultOk(true);
      setResultMsg(
        `Device received your WiFi credentials.\n\nIt will connect to "${ssid}" and resume normal operation.`
      );
      onSuccess?.();
      setStep(3);
    } catch (err) {
      setSending(false);
      if (err.name === 'AbortError') {
        // Timeout usually means ESP rebooted mid-request — that's actually OK
        setResultOk(true);
        setResultMsg(
          `Device received your WiFi credentials.\n\nIt will reconnect to "${ssid}" shortly.`
        );
        onSuccess?.();
      } else {
        setResultOk(false);
        setResultMsg(`Failed to send WiFi credentials: ${err.message}`);
      }
      setStep(3);
    }
  };

  const handleDone = () => {
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const stepTitles = [
    'Connect to Device',
    'Enter New WiFi',
    resultOk ? 'WiFi Updated!' : 'Something Went Wrong',
  ];

  const deviceName = device?.name || device?.device_id || 'Unknown Device';

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.surface }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[wm.fullscreen, { backgroundColor: theme.surface }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
            bounces={true}
          >

            {/* Header */}
            <View style={wm.header}>
              <View style={[wm.headerIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="wifi" size={20} color={primary} />
              </View>
              <Text style={[wm.title, { color: theme.text }]}>{stepTitles[step - 1]}</Text>
              {step !== 2 && (
                <TouchableOpacity onPress={step === 1 ? onClose : () => setStep(s => s - 1)} style={wm.closeBtn}>
                  <Ionicons name={step === 1 ? 'close' : 'arrow-back'} size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Step dots */}
            <StepDots current={step} total={3} primary={primary} />

            {/* ── STEP 1: Instructions ────────────────────────────────────── */}
            {step === 1 && (
              <View style={wm.body}>
                {/* Device info */}
                <View style={[wm.deviceCard, { backgroundColor: theme.primaryLight, borderColor: primary }]}>
                  <Ionicons name="hardware-chip" size={24} color={primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[wm.deviceCardLabel, { color: theme.textMuted }]}>Updating WiFi for</Text>
                    <Text style={[wm.deviceCardName, { color: primary }]}>{deviceName}</Text>
                  </View>
                </View>

                {/* Steps */}
                {[
                  {
                    icon: 'power-outline',
                    title: 'Power on your sensor',
                    desc: 'Make sure your ThermoGo device is powered on and in pairing mode.',
                  },
                  {
                    icon: 'settings-outline',
                    title: 'Open WiFi settings',
                    desc: 'Tap the button below to open your phone\'s WiFi settings.',
                  },
                  {
                    icon: 'wifi-outline',
                    title: 'Connect to ThermoGo hotspot',
                    desc: 'Find and connect to the network named "ThermoGo-" followed by your device ID. No password needed.',
                  },
                  {
                    icon: 'arrow-back-outline',
                    title: 'Come back here',
                    desc: 'Return to this app when connected. You\'ll enter your new WiFi credentials.',
                  },
                ].map((item, i) => (
                  <View key={i} style={[wm.instrRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                    <View style={[wm.instrBadge, { backgroundColor: primary }]}>
                      <Text style={wm.instrBadgeText}>{i + 1}</Text>
                    </View>
                    <View style={[wm.instrIconCircle, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name={item.icon} size={18} color={primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[wm.instrTitle, { color: theme.text }]}>{item.title}</Text>
                      <Text style={[wm.instrDesc, { color: theme.textSecondary }]}>{item.desc}</Text>
                    </View>
                  </View>
                ))}

                {/* Warning */}
                <View style={[wm.warnBox, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.warning} />
                  <Text style={[wm.warnText, { color: theme.warning }]}>
                    Internet will be unavailable while connected to the ThermoGo hotspot. This is normal.
                  </Text>
                </View>

                {/* Open WiFi settings */}
                <TouchableOpacity
                  style={[wm.settingsBtn, { backgroundColor: primary }]}
                  onPress={() => { openWifiSettings(); }}
                >
                  <Ionicons name="wifi" size={18} color="#fff" />
                  <Text style={wm.settingsBtnText}>Open WiFi Settings</Text>
                  <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>

                {/* Manual continue */}
                <TouchableOpacity
                  style={[wm.ghostBtn, { borderColor: primary }]}
                  onPress={() => setStep(2)}
                >
                  <Text style={[wm.ghostBtnText, { color: primary }]}>
                    Already connected — Continue
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={primary} />
                </TouchableOpacity>

                <TouchableOpacity onPress={onClose} style={wm.cancelLink}>
                  <Text style={[wm.cancelText, { color: theme.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Enter WiFi credentials ──────────────────────────── */}
            {step === 2 && (
              <View style={wm.body}>

                {/* Device info */}
                <View style={[wm.deviceCard, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[wm.deviceCardLabel, { color: theme.success }]}>Connected to</Text>
                    <Text style={[wm.deviceCardName, { color: theme.text }]}>{deviceName}</Text>
                  </View>
                </View>

                {/* Info */}
                <View style={[wm.infoBox, { backgroundColor: theme.primaryLight, borderColor: primary + '30' }]}>
                  <Ionicons name="information-circle-outline" size={16} color={primary} />
                  <Text style={[wm.infoText, { color: primary }]}>
                    Enter your home WiFi network details. The device will receive these credentials and reconnect to your network.
                  </Text>
                </View>

                {/* SSID */}
                <Text style={[wm.fieldLabel, { color: theme.textMuted }]}>WIFI NETWORK NAME (SSID) *</Text>
                <View style={[wm.inputRow, { borderColor: ssid ? primary : theme.border, backgroundColor: theme.surfaceAlt }]}>
                  <Ionicons name="wifi-outline" size={18} color={theme.textMuted} style={{ marginLeft: SPACING.sm }} />
                  <Input
                    value={ssid}
                    onChangeText={setSsid}
                    placeholder="e.g. HomeNetwork"
                    autoCapitalize="none"
                    autoCorrect={false}
                    noLabel
                    style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
                  />
                  {ssid.length > 0 && (
                    <TouchableOpacity onPress={() => setSsid('')} style={{ padding: SPACING.sm }}>
                      <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Password */}
                <Text style={[wm.fieldLabel, { color: theme.textMuted, marginTop: SPACING.md }]}>WIFI PASSWORD</Text>
                <View style={[wm.inputRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={theme.textMuted} style={{ marginLeft: SPACING.sm }} />
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Leave blank for open networks"
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                    noLabel
                    style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
                  />
                  <TouchableOpacity onPress={() => setShowPass(p => !p)} style={{ padding: SPACING.sm }}>
                    <Ionicons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {/* Send button */}
                <TouchableOpacity
                  style={[wm.primaryBtn, { backgroundColor: primary, opacity: sending ? 0.7 : 1, marginTop: SPACING.xl }]}
                  onPress={handleSendCredentials}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send-outline" size={18} color="#fff" />
                  )}
                  <Text style={wm.primaryBtnText}>
                    {sending ? 'Sending…' : 'Update WiFi'}
                  </Text>
                </TouchableOpacity>

                {sending && (
                  <View style={[wm.sendingNote, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                    <ActivityIndicator size="small" color={primary} />
                    <Text style={[wm.sendingNoteText, { color: theme.textSecondary }]}>
                      Sending WiFi credentials to device…
                    </Text>
                  </View>
                )}

                <TouchableOpacity onPress={() => setStep(1)} style={wm.cancelLink}>
                  <Text style={[wm.cancelText, { color: theme.textMuted }]}>← Back to start</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 3: Result ──────────────────────────────────────────── */}
            {step === 3 && (
              <View style={wm.body}>
                <View style={[
                  wm.resultCircle,
                  { backgroundColor: resultOk ? theme.successBg : theme.dangerBg,
                    borderColor:     resultOk ? theme.success    : theme.danger },
                ]}>
                  <Ionicons
                    name={resultOk ? 'checkmark-circle' : 'close-circle'}
                    size={52}
                    color={resultOk ? theme.success : theme.danger}
                  />
                </View>

                <Text style={[wm.resultTitle, { color: theme.text }]}>
                  {resultOk ? 'WiFi updated!' : 'Something went wrong'}
                </Text>
                <Text style={[wm.resultMsg, { color: theme.textSecondary }]}>{resultMsg}</Text>

                {resultOk && (
                  <>
                    {/* Reconnect reminder */}
                    <View style={[wm.warnBox, { backgroundColor: theme.warningBg, borderColor: theme.warning, marginTop: SPACING.lg }]}>
                      <Ionicons name="wifi-outline" size={16} color={theme.warning} />
                      <Text style={[wm.warnText, { color: theme.warning }]}>
                        Remember to reconnect your phone to your home WiFi network when done.
                      </Text>
                    </View>

                    {/* What happens next */}
                    <View style={[wm.nextBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                      <Text style={[wm.nextTitle, { color: theme.text }]}>What happens next:</Text>
                      {[
                        'The device receives your WiFi credentials',
                        'Device restarts and connects to your network',
                        'Device resumes normal monitoring and data reporting',
                      ].map((txt, i) => (
                        <View key={i} style={wm.nextRow}>
                          <View style={[wm.nextDot, { backgroundColor: primary }]} />
                          <Text style={[wm.nextText, { color: theme.textSecondary }]}>{txt}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[wm.primaryBtn, { backgroundColor: resultOk ? primary : theme.danger, marginTop: SPACING.lg }]}
                  onPress={resultOk ? handleDone : () => setStep(1)}
                >
                  <Ionicons
                    name={resultOk ? 'checkmark-outline' : 'refresh-outline'}
                    size={18}
                    color="#fff"
                  />
                  <Text style={wm.primaryBtnText}>
                    {resultOk ? 'Done' : 'Try Again'}
                  </Text>
                </TouchableOpacity>

                {!resultOk && (
                  <TouchableOpacity onPress={onClose} style={wm.cancelLink}>
                    <Text style={[wm.cancelText, { color: theme.textMuted }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const wm = StyleSheet.create({
  fullscreen: { flex: 1 },

  header:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: SPACING.sm, marginBottom: SPACING.sm },
  headerIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, fontSize: FONT_SIZES.lg, fontWeight: '800' },
  closeBtn:   { padding: SPACING.xs },

  body: { paddingHorizontal: SPACING.xl, paddingBottom: 60 },

  // Device card
  deviceCard:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  deviceCardLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  deviceCardName:  { fontSize: FONT_SIZES.base, fontWeight: '800', marginTop: 2 },

  // Instruction rows
  instrRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  instrBadge:     { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instrBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  instrIconCircle:{ width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instrTitle:     { fontSize: FONT_SIZES.sm, fontWeight: '700', marginBottom: 2 },
  instrDesc:      { fontSize: FONT_SIZES.xs, lineHeight: 18 },

  // Boxes
  warnBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  warnText: { flex: 1, fontSize: FONT_SIZES.xs, lineHeight: 18 },
  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  infoText: { flex: 1, fontSize: FONT_SIZES.xs, lineHeight: 18 },

  // Buttons
  settingsBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.lg },
  settingsBtnText: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZES.sm },
  ghostBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, borderWidth: 1.5, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.sm },
  ghostBtnText:    { fontWeight: '700', fontSize: FONT_SIZES.sm },
  primaryBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: RADIUS.md, paddingVertical: SPACING.md + 2, marginTop: SPACING.lg },
  primaryBtnText:  { color: '#fff', fontWeight: '800', fontSize: FONT_SIZES.base },

  cancelLink: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs },
  cancelText: { fontSize: FONT_SIZES.sm },

  // Fields
  fieldLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: SPACING.xs },
  inputRow:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.md, overflow: 'hidden', minHeight: 48 },

  sendingNote:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  sendingNoteText: { flex: 1, fontSize: FONT_SIZES.xs, lineHeight: 18 },

  // Results
  resultCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 2, alignSelf: 'center', marginBottom: SPACING.lg },
  resultTitle:  { fontSize: FONT_SIZES.xl, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  resultMsg:    { fontSize: FONT_SIZES.sm, textAlign: 'center', lineHeight: 22 },
  nextBox:      { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },
  nextTitle:    { fontSize: FONT_SIZES.sm, fontWeight: '700', marginBottom: SPACING.sm },
  nextRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.xs },
  nextDot:      { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  nextText:     { flex: 1, fontSize: FONT_SIZES.sm, lineHeight: 20 },
});

export default UpdateWiFiModal;
