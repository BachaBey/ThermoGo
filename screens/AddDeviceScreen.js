import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Alert, Modal, Pressable, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { useAuth }  from '../services/AuthContext';
import {
  getUserDevices, addDevice, updateDevice,
  deleteDevice, subscribeToDevices,
  getDeviceWifiNetworks, addDeviceWifiNetwork, deleteDeviceWifiNetwork,
} from '../services/supabase';
import { Button, Input, Card, Divider } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

// ─── ESP config ───────────────────────────────────────────────────────────────
const ESP_HOST          = 'http://192.168.4.1';
const ESP_ID_ENDPOINT   = `${ESP_HOST}/`;          // GET  → { device_id: "a1b2c3" }
const ESP_WIFI_ENDPOINT = `${ESP_HOST}/add_wifi`;  // POST → { ssid, password }
const FETCH_TIMEOUT_MS  = 8000;
const USE_MOCK          = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const emptyForm = () => ({
  device_id: '', name: '',
  target_temp: '', target_humidity: '',
  threshold_temp: '', threshold_humidity: '',
});

const numericField = (v) =>
  v === '' || v === null || v === undefined ? null : Number(v);

const sanitizeNum = (v) => {
  const cleaned   = v.replace(/[^0-9.\-]/g, '');
  const withMinus = cleaned.startsWith('-');
  const abs       = withMinus ? cleaned.slice(1) : cleaned;
  const dotParts  = abs.split('.');
  const sanitized = dotParts[0] + (dotParts.length > 1 ? '.' + dotParts.slice(1).join('') : '');
  return (withMinus ? '-' : '') + sanitized;
};

const fetchWithTimeout = (url, options = {}, ms = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

const openWifiSettings = () => {
  if (Platform.OS === 'ios') {
    Linking.openURL('App-Prefs:WIFI').catch(() => Linking.openURL('app-settings:'));
  } else {
    Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() =>
      Linking.openURL('android.settings.WIFI_SETTINGS')
    );
  }
};

// ─── Numeric input ────────────────────────────────────────────────────────────
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
// WIFI PROVISIONING MODAL  — 4 steps
//  1. Instruction: go to WiFi settings, connect to ThermoGo-XXXX
//  2. Fetching device ID from ESP (auto, triggered when user returns)
//  3. Enter home WiFi credentials
//  4. Result (success or error)
// ═════════════════════════════════════════════════════════════════════════════
const WifiProvisionModal = ({ visible, onClose, onProvisioned, theme }) => {
  const [step,       setStep]      = useState(1);
  const [deviceId,   setDeviceId]  = useState('');
  const [fetching,   setFetching]  = useState(false);
  const [fetchError, setFetchError]= useState('');
  const [ssid,       setSsid]      = useState('');
  const [password,   setPassword]  = useState('');
  const [showPass,   setShowPass]  = useState(false);
  const [targetTemp,     setTargetTemp]     = useState('');
  const [targetHumidity, setTargetHumidity] = useState('');
  const [thresholdTemp,  setThresholdTemp]  = useState('');
  const [thresholdHumidity, setThresholdHumidity] = useState('');
  const [sending,    setSending]   = useState(false);
  const [resultOk,   setResultOk]  = useState(false);
  const [resultMsg,  setResultMsg] = useState('');
  const appState = useRef(AppState.currentState);
  const primary  = theme.primary;

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setStep(1); setDeviceId(''); setFetching(false); setFetchError('');
      setSsid(''); setPassword(''); setShowPass(false);
      setTargetTemp(''); setTargetHumidity(''); setThresholdTemp(''); setThresholdHumidity('');
      setSending(false); setResultOk(false); setResultMsg('');
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
        // User came back — try to fetch device ID
        handleFetchDeviceId();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [visible, step]);

  // ── Step 2: fetch device ID from ESP ──────────────────────────────────────
  const handleFetchDeviceId = async () => {
    setStep(2);
    setFetching(true);
    setFetchError('');

    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 1500));
      setDeviceId('a1b2c3');
      setFetching(false);
      setStep(3);
      return;
    }

    try {
      const res = await fetchWithTimeout(ESP_ID_ENDPOINT, {}, 8000);
      if (!res.ok) throw new Error(`Device returned status ${res.status}`);
      const json = await res.json();
      const id   = (json.device_id || '').trim();
      if (!id) throw new Error('Device did not return a valid ID');
      setDeviceId(id);
      setFetching(false);
      setStep(3);
    } catch (err) {
      setFetching(false);
      if (err.name === 'AbortError') {
        setFetchError(
          'Could not reach the ThermoGo device.\n\nMake sure your phone is connected to the ThermoGo-XXXX WiFi network, then try again.'
        );
      } else {
        setFetchError(`Failed to read device: ${err.message}`);
      }
    }
  };

  // ── Step 3 → 4: send WiFi credentials to ESP ──────────────────────────────
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
      setResultMsg(`Device "${deviceId}" is now connecting to "${ssid}". It will restart automatically.`);
      setStep(4);
      return;
    }

    try {
      const res = await fetchWithTimeout(
        ESP_WIFI_ENDPOINT,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ssid: ssid.trim(), password }),
        },
        8000
      );
      // ESP reboots immediately after saving — it may drop the connection
      // before sending a response. Both ok and abort are treated as success.
      setSending(false);
      setResultOk(true);
      setResultMsg(
        `Device "${deviceId}" received your WiFi credentials and is restarting.\n\nIt will connect to "${ssid}" in a few seconds.`
      );
      setStep(4);
    } catch (err) {
      setSending(false);
      if (err.name === 'AbortError') {
        // Timeout usually means ESP rebooted mid-request — that's actually OK
        setResultOk(true);
        setResultMsg(
          `Device "${deviceId}" received your WiFi credentials and restarted.\n\nIt will connect to "${ssid}" shortly.`
        );
      } else {
        setResultOk(false);
        setResultMsg(`Failed to send credentials: ${err.message}`);
      }
      setStep(4);
    }
  };

  const handleDone = () => {
    if (resultOk) {
      const fields = {
        target_temp: numericField(targetTemp),
        target_humidity: numericField(targetHumidity),
        threshold_temp: numericField(thresholdTemp),
        threshold_humidity: numericField(thresholdHumidity),
      };
      onProvisioned(deviceId, fields); // Pass deviceId and target fields
    }
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const stepTitles = [
    'Connect to Device',
    'Reading Device ID…',
    'Configure Device',
    resultOk ? 'Device Configured!' : 'Something Went Wrong',
  ];

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
            <StepDots current={step} total={4} primary={primary} />

            {/* ── STEP 1: Instructions ────────────────────────────────────── */}
            {step === 1 && (
              <View style={wm.body}>

                {/* Visual flow diagram */}
                <View style={[wm.diagram, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  <View style={[wm.diagramBox, { borderColor: primary, backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="hardware-chip-outline" size={24} color={primary} />
                    <Text style={[wm.diagramLabel, { color: primary }]}>ESP8266</Text>
                    <Text style={[wm.diagramSub, { color: primary }]}>ThermoGo-XXXX</Text>
                  </View>
                  <View style={wm.diagramLine}>
                    <View style={[wm.diagramDash, { backgroundColor: primary }]} />
                    <Ionicons name="wifi-outline" size={16} color={primary} />
                    <View style={[wm.diagramDash, { backgroundColor: primary }]} />
                  </View>
                  <View style={[wm.diagramBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                    <Ionicons name="phone-portrait-outline" size={24} color={theme.textMuted} />
                    <Text style={[wm.diagramLabel, { color: theme.textMuted }]}>Your Phone</Text>
                    <Text style={[wm.diagramSub, { color: theme.textMuted }]}>Connect here</Text>
                  </View>
                </View>

                {/* Steps */}
                {[
                  {
                    icon: 'power-outline',
                    color: primary,
                    title: 'Power on your sensor',
                    desc:  'Make sure your ThermoGo device is powered on. The LED should be blinking.',
                  },
                  {
                    icon: 'settings-outline',
                    color: primary,
                    title: 'Open WiFi settings',
                    desc:  'Tap the button below to open your phone\'s WiFi settings.',
                  },
                  {
                    icon: 'wifi-outline',
                    color: primary,
                    title: 'Connect to ThermoGo-XXXX',
                    desc:  'Find and connect to the network named "ThermoGo-" followed by your device ID. No password needed.',
                  },
                  {
                    icon: 'arrow-back-outline',
                    color: primary,
                    title: 'Come back here',
                    desc:  'Return to this app after connecting. The device ID will be read automatically.',
                  },
                ].map((item, i) => (
                  <View key={i} style={[wm.instrRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                    <View style={[wm.instrBadge, { backgroundColor: item.color }]}>
                      <Text style={wm.instrBadgeText}>{i + 1}</Text>
                    </View>
                    <View style={[wm.instrIconCircle, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name={item.icon} size={18} color={item.color} />
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
                  onPress={handleFetchDeviceId}
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

            {/* ── STEP 2: Fetching device ID ──────────────────────────────── */}
            {step === 2 && (
              <View style={wm.body}>
                {fetching ? (
                  <View style={wm.fetchingBox}>
                    <ActivityIndicator size="large" color={primary} />
                    <Text style={[wm.fetchingTitle, { color: theme.text }]}>
                      Reading device information…
                    </Text>
                    <Text style={[wm.fetchingDesc, { color: theme.textSecondary }]}>
                      Connecting to 192.168.4.1
                    </Text>
                  </View>
                ) : fetchError ? (
                  <View style={wm.fetchingBox}>
                    <View style={[wm.errorCircle, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
                      <Ionicons name="wifi-outline" size={32} color={theme.danger} />
                    </View>
                    <Text style={[wm.fetchingTitle, { color: theme.text }]}>
                      Could not reach device
                    </Text>
                    <Text style={[wm.fetchingDesc, { color: theme.textSecondary }]}>
                      {fetchError}
                    </Text>
                    <TouchableOpacity
                      style={[wm.settingsBtn, { backgroundColor: primary, marginTop: SPACING.lg }]}
                      onPress={() => openWifiSettings()}
                    >
                      <Ionicons name="wifi" size={18} color="#fff" />
                      <Text style={wm.settingsBtnText}>Open WiFi Settings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[wm.ghostBtn, { borderColor: primary, marginTop: SPACING.sm }]}
                      onPress={handleFetchDeviceId}
                    >
                      <Ionicons name="refresh-outline" size={16} color={primary} />
                      <Text style={[wm.ghostBtnText, { color: primary }]}>Try Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setStep(1)} style={wm.cancelLink}>
                      <Text style={[wm.cancelText, { color: theme.textMuted }]}>← Back to instructions</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── STEP 3: Enter WiFi credentials ─────────────────────────── */}
            {step === 3 && (
              <View style={wm.body}>

                {/* Device ID confirmed */}
                <View style={[wm.idConfirm, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[wm.idConfirmLabel, { color: theme.success }]}>Device found!</Text>
                    <Text style={[wm.idConfirmId, { color: theme.text }]}>ID: {deviceId}</Text>
                  </View>
                </View>

                {/* Info */}
                <View style={[wm.infoBox, { backgroundColor: theme.primaryLight, borderColor: primary + '30' }]}>
                  <Ionicons name="information-circle-outline" size={16} color={primary} />
                  <Text style={[wm.infoText, { color: primary }]}>
                    Configure your home WiFi credentials and set target temperature/humidity levels for this device.
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

                {/* Target Values Section */}
                <View style={[wm.sectionDivider, { backgroundColor: theme.divider, marginTop: SPACING.xl, marginBottom: SPACING.lg }]} />
                <View style={wm.sectionHeader}>
                  <SectionIcon ionicon="flag-outline" color={primary} bg={theme.primaryLight} />
                  <Text style={[wm.sectionTitle, { color: theme.text }]}>Target Values</Text>
                </View>
                <Text style={[wm.sectionDesc, { color: theme.textSecondary }]}>
                  Set the desired temperature and humidity levels for this device.
                </Text>

                {/* Target Temp and Humidity */}
                <View style={wm.twoCol}>
                  <View style={wm.inputGroup}>
                    <Text style={[wm.fieldLabel, { color: theme.textMuted }]}>TARGET TEMP</Text>
                    <View style={[wm.inputRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                      <Input
                        value={targetTemp}
                        onChangeText={(v) => setTargetTemp(sanitizeNum(v))}
                        placeholder="-18"
                        keyboardType="default"
                        autoCapitalize="none"
                        noLabel
                        style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
                      />
                      <Text style={[wm.suffix, { color: theme.textSecondary }]}>°C</Text>
                    </View>
                  </View>
                  <View style={wm.inputGroup}>
                    <Text style={[wm.fieldLabel, { color: theme.textMuted }]}>TARGET HUMIDITY</Text>
                    <View style={[wm.inputRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                      <Input
                        value={targetHumidity}
                        onChangeText={(v) => setTargetHumidity(sanitizeNum(v))}
                        placeholder="60"
                        keyboardType="default"
                        autoCapitalize="none"
                        noLabel
                        style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
                      />
                      <Text style={[wm.suffix, { color: theme.textSecondary }]}>%</Text>
                    </View>
                  </View>
                </View>

                {/* Tolerance Section */}
                <View style={wm.sectionHeader}>
                  <SectionIcon ionicon="alert-circle-outline" color={theme.warning} bg={theme.warningBg} />
                  <Text style={[wm.sectionTitle, { color: theme.text }]}>Tolerance</Text>
                </View>
                <Text style={[wm.sectionDesc, { color: theme.textSecondary }]}>
                  Alert when readings deviate from targets by this amount.
                </Text>

                {/* Threshold Temp and Humidity */}
                <View style={wm.twoCol}>
                  <View style={wm.inputGroup}>
                    <Text style={[wm.fieldLabel, { color: theme.textMuted }]}>TEMP ±</Text>
                    <View style={[wm.inputRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                      <Input
                        value={thresholdTemp}
                        onChangeText={(v) => setThresholdTemp(sanitizeNum(v))}
                        placeholder="3"
                        keyboardType="default"
                        autoCapitalize="none"
                        noLabel
                        style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
                      />
                      <Text style={[wm.suffix, { color: theme.textSecondary }]}>°C</Text>
                    </View>
                  </View>
                  <View style={wm.inputGroup}>
                    <Text style={[wm.fieldLabel, { color: theme.textMuted }]}>HUMIDITY ±</Text>
                    <View style={[wm.inputRow, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                      <Input
                        value={thresholdHumidity}
                        onChangeText={(v) => setThresholdHumidity(sanitizeNum(v))}
                        placeholder="10"
                        keyboardType="default"
                        autoCapitalize="none"
                        noLabel
                        style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
                      />
                      <Text style={[wm.suffix, { color: theme.textSecondary }]}>%</Text>
                    </View>
                  </View>
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
                    {sending ? 'Sending to ESP…' : 'Send to ESP'}
                  </Text>
                </TouchableOpacity>

                {sending && (
                  <View style={[wm.sendingNote, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                    <ActivityIndicator size="small" color={primary} />
                    <Text style={[wm.sendingNoteText, { color: theme.textSecondary }]}>
                      Sending to 192.168.4.1… The device will restart after receiving credentials.
                    </Text>
                  </View>
                )}

                <TouchableOpacity onPress={() => { setStep(1); setFetchError(''); }} style={wm.cancelLink}>
                  <Text style={[wm.cancelText, { color: theme.textMuted }]}>← Back to start</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 4: Result ──────────────────────────────────────────── */}
            {step === 4 && (
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
                  {resultOk ? 'Device provisioned!' : 'Something went wrong'}
                </Text>
                <Text style={[wm.resultMsg, { color: theme.textSecondary }]}>{resultMsg}</Text>

                {resultOk && (
                  <>
                    {/* Reconnect reminder */}
                    <View style={[wm.warnBox, { backgroundColor: theme.warningBg, borderColor: theme.warning, marginTop: SPACING.lg }]}>
                      <Ionicons name="wifi-outline" size={16} color={theme.warning} />
                      <Text style={[wm.warnText, { color: theme.warning }]}>
                        Remember to reconnect your phone to your home WiFi before registering the device.
                      </Text>
                    </View>

                    {/* What happens next */}
                    <View style={[wm.nextBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                      <Text style={[wm.nextTitle, { color: theme.text }]}>What happens next:</Text>
                      {[
                        'The sensor restarts and connects to your WiFi.',
                        'Target values are saved to your account.',
                        'The device will start monitoring and reporting data.',
                        'You can edit settings anytime from the device list.',
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
                    {resultOk ? 'Device Configured!' : 'Try Again'}
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
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: SPACING.sm },

  header:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: SPACING.sm, marginBottom: SPACING.sm },
  headerIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, fontSize: FONT_SIZES.lg, fontWeight: '800' },
  closeBtn:   { padding: SPACING.xs },

  body: { paddingHorizontal: SPACING.xl, paddingBottom: 60 },

  // Diagram
  diagram:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.xl, gap: SPACING.md },
  diagramBox:   { alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: RADIUS.md, padding: SPACING.md, minWidth: 90 },
  diagramLabel: { fontSize: FONT_SIZES.xs, fontWeight: '800' },
  diagramSub:   { fontSize: 10, fontWeight: '500' },
  diagramLine:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  diagramDash:  { flex: 1, height: 1.5 },

  // Instruction rows
  instrRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  instrBadge:     { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instrBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  instrIconCircle:{ width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instrTitle:     { fontSize: FONT_SIZES.sm, fontWeight: '700', marginBottom: 2 },
  instrDesc:      { fontSize: FONT_SIZES.xs, lineHeight: 18 },

  warnBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  warnText: { flex: 1, fontSize: FONT_SIZES.xs, lineHeight: 18 },

  settingsBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.lg },
  settingsBtnText: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZES.sm },

  ghostBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, borderWidth: 1.5, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.sm },
  ghostBtnText: { fontWeight: '700', fontSize: FONT_SIZES.sm },

  cancelLink: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs },
  cancelText: { fontSize: FONT_SIZES.sm },

  // Step 2 fetching
  fetchingBox:   { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xl },
  fetchingTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', textAlign: 'center' },
  fetchingDesc:  { fontSize: FONT_SIZES.sm, textAlign: 'center', lineHeight: 20 },
  errorCircle:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

  // Step 3
  idConfirm:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  idConfirmLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  idConfirmId:    { fontSize: FONT_SIZES.base, fontWeight: '800', marginTop: 2 },
  infoBox:        { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  infoText:       { flex: 1, fontSize: FONT_SIZES.xs, lineHeight: 18 },
  fieldLabel:     { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: SPACING.xs },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.md, overflow: 'hidden', minHeight: 48 },

  primaryBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderRadius: RADIUS.md, paddingVertical: SPACING.md + 2, marginTop: SPACING.lg },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZES.base },

  sendingNote:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  sendingNoteText: { flex: 1, fontSize: FONT_SIZES.xs, lineHeight: 18 },

  // New styles for target values section
  sectionDivider: { height: 1, marginHorizontal: -SPACING.xl },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  sectionTitle:   { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  sectionDesc:    { fontSize: FONT_SIZES.xs, lineHeight: 18, marginBottom: SPACING.md },
  twoCol:         { flexDirection: 'row', gap: SPACING.sm },
  inputGroup:     { flex: 1 },
  suffix:         { fontSize: FONT_SIZES.sm, fontWeight: '600', marginRight: SPACING.sm },

  // Step 4
  resultCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 2, alignSelf: 'center', marginBottom: SPACING.lg },
  resultTitle:  { fontSize: FONT_SIZES.xl, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  resultMsg:    { fontSize: FONT_SIZES.sm, textAlign: 'center', lineHeight: 22 },
  nextBox:      { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },
  nextTitle:    { fontSize: FONT_SIZES.sm, fontWeight: '700', marginBottom: SPACING.sm },
  nextRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.xs },
  nextDot:      { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  nextText:     { flex: 1, fontSize: FONT_SIZES.sm, lineHeight: 20 },
});

// ═════════════════════════════════════════════════════════════════════════════
// WIFI NETWORKS SUB-SECTION  (used inside EditDeviceModal)
// ═════════════════════════════════════════════════════════════════════════════
const MAX_WIFI = 5;

const WifiNetworksSection = ({ deviceId, theme }) => {
  const [networks,    setNetworks]   = useState([]);
  const [loadingList, setLoadingList]= useState(false);
  const [showForm,    setShowForm]   = useState(false);
  const [newSsid,     setNewSsid]    = useState('');
  const [newPassword, setNewPassword]= useState('');
  const [showPass,    setShowPass]   = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [formError,   setFormError]  = useState('');
  const [formSuccess, setFormSuccess]= useState('');
  const [deleting,    setDeleting]   = useState(null); // id being deleted

  const primary = theme.primary;

  const fetchNetworks = async () => {
    setLoadingList(true);
    const { data, error } = await getDeviceWifiNetworks(deviceId);
    setLoadingList(false);
    if (!error) setNetworks(data || []);
  };

  useEffect(() => {
    if (deviceId) fetchNetworks();
  }, [deviceId]);

  // Auto-clear messages
  useEffect(() => {
    if (!formSuccess) return;
    const t = setTimeout(() => setFormSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [formSuccess]);

  const handleAdd = async () => {
    setFormError('');
    if (!newSsid.trim()) { setFormError('WiFi network name (SSID) is required.'); return; }
    setSaving(true);
    const { data, error } = await addDeviceWifiNetwork(deviceId, newSsid.trim(), newPassword);
    setSaving(false);
    if (error) {
      setFormError(error.message);
    } else {
      setNetworks(prev => [data, ...prev]);
      setNewSsid('');
      setNewPassword('');
      setShowForm(false);
      setFormSuccess(`"${data.ssid}" saved successfully.`);
    }
  };

  const handleDelete = (network) => {
    const confirm = async () => {
      setDeleting(network.id);
      const { error } = await deleteDeviceWifiNetwork(network.id);
      setDeleting(null);
      if (error) {
        setFormError(error.message);
      } else {
        setNetworks(prev => prev.filter(n => n.id !== network.id));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${network.ssid}"?`)) confirm();
    } else {
      Alert.alert(
        'Remove Network',
        `Remove "${network.ssid}" from this device?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: confirm }]
      );
    }
  };

  const atLimit = networks.length >= MAX_WIFI;

  return (
    <View>
      {/* ── Section header ── */}
      <View style={[ew.sectionHeader, { borderTopColor: theme.divider }]}>
        <View style={[ew.sectionIconCircle, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="wifi" size={16} color={primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ew.sectionTitle, { color: theme.text }]}>Saved WiFi Networks</Text>
          <Text style={[ew.sectionSub, { color: theme.textMuted }]}>
            {networks.length}/{MAX_WIFI} — ESP pulls credentials automatically
          </Text>
        </View>
        {!atLimit && !showForm && (
          <TouchableOpacity
            onPress={() => { setShowForm(true); setFormError(''); }}
            style={[ew.addBtn, { backgroundColor: primary }]}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={ew.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Success banner ── */}
      {formSuccess ? (
        <View style={[ew.successBox, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
          <Ionicons name="checkmark-circle-outline" size={14} color={theme.success} />
          <Text style={[ew.successText, { color: theme.success }]}>{formSuccess}</Text>
        </View>
      ) : null}

      {/* ── At limit warning ── */}
      {atLimit && (
        <View style={[ew.limitBox, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}>
          <Ionicons name="warning-outline" size={14} color={theme.warning} />
          <Text style={[ew.limitText, { color: theme.warning }]}>
            Maximum {MAX_WIFI} networks reached. Delete one to add another.
          </Text>
        </View>
      )}

      {/* ── Add new WiFi form ── */}
      {showForm && (
        <View style={[ew.form, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[ew.formTitle, { color: theme.text }]}>New WiFi Network</Text>

          {formError ? (
            <View style={[ew.errorBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
              <Ionicons name="warning-outline" size={13} color={theme.danger} />
              <Text style={[ew.errorText, { color: theme.danger }]}>{formError}</Text>
            </View>
          ) : null}

          {/* SSID */}
          <Text style={[ew.fieldLabel, { color: theme.textMuted }]}>NETWORK NAME (SSID) *</Text>
          <View style={[ew.inputRow, { borderColor: newSsid ? primary : theme.border, backgroundColor: theme.surface }]}>
            <Ionicons name="wifi-outline" size={16} color={theme.textMuted} style={{ marginLeft: SPACING.sm }} />
            <Input
              value={newSsid}
              onChangeText={setNewSsid}
              placeholder="e.g. HomeNetwork"
              autoCapitalize="none"
              autoCorrect={false}
              noLabel
              style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
            />
          </View>

          {/* Password */}
          <Text style={[ew.fieldLabel, { color: theme.textMuted, marginTop: SPACING.sm }]}>PASSWORD</Text>
          <View style={[ew.inputRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} style={{ marginLeft: SPACING.sm }} />
            <Input
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Leave blank for open networks"
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              noLabel
              style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={{ padding: SPACING.sm }}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Note about plain text */}
          <View style={[ew.noteRow, { }]}>
            <Ionicons name="information-circle-outline" size={12} color={theme.textMuted} />
            <Text style={[ew.noteText, { color: theme.textMuted }]}>
              Passwords are stored in Supabase. Protect your data using RLS policies.
            </Text>
          </View>

          {/* Form actions */}
          <View style={ew.formActions}>
            <TouchableOpacity
              onPress={() => { setShowForm(false); setFormError(''); setNewSsid(''); setNewPassword(''); }}
              style={[ew.cancelFormBtn, { borderColor: theme.border }]}
            >
              <Text style={[ew.cancelFormText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAdd}
              disabled={saving}
              style={[ew.saveFormBtn, { backgroundColor: primary, opacity: saving ? 0.7 : 1 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="save-outline" size={15} color="#fff" />
              }
              <Text style={ew.saveFormText}>{saving ? 'Saving…' : 'Save Network'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Saved networks list ── */}
      {loadingList ? (
        <View style={ew.loadingRow}>
          <ActivityIndicator size="small" color={primary} />
          <Text style={[ew.loadingText, { color: theme.textMuted }]}>Loading saved networks…</Text>
        </View>
      ) : networks.length === 0 ? (
        <View style={[ew.emptyBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Ionicons name="wifi-outline" size={24} color={theme.textMuted} />
          <Text style={[ew.emptyText, { color: theme.textMuted }]}>No WiFi networks saved yet</Text>
          <Text style={[ew.emptySub, { color: theme.textMuted }]}>Tap Add to save the first one</Text>
        </View>
      ) : (
        <View style={[ew.networkList, { borderColor: theme.border }]}>
          {networks.map((network, index) => (
            <View key={network.id}>
              <View style={ew.networkRow}>
                <View style={[ew.networkIconCircle, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="wifi" size={14} color={primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ew.networkSsid, { color: theme.text }]}>{network.ssid}</Text>
                  <Text style={[ew.networkDate, { color: theme.textMuted }]}>
                    Added {new Date(network.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(network)}
                  disabled={deleting === network.id}
                  style={[ew.deleteBtn, { borderColor: theme.danger }]}
                >
                  {deleting === network.id
                    ? <ActivityIndicator size="small" color={theme.danger} />
                    : <Ionicons name="trash-outline" size={14} color={theme.danger} />
                  }
                </TouchableOpacity>
              </View>
              {index < networks.length - 1 && (
                <View style={[ew.networkDivider, { backgroundColor: theme.divider }]} />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const ew = StyleSheet.create({
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.lg, borderTopWidth: 1, marginTop: SPACING.lg, marginBottom: SPACING.md },
  sectionIconCircle:{ width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:     { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  sectionSub:       { fontSize: FONT_SIZES.xs, marginTop: 2 },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  addBtnText:       { color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.xs },

  successBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm },
  successText:{ fontSize: FONT_SIZES.xs, fontWeight: '500', flex: 1 },

  limitBox:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm },
  limitText: { fontSize: FONT_SIZES.xs, flex: 1 },

  form:        { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  formTitle:   { fontSize: FONT_SIZES.sm, fontWeight: '700', marginBottom: SPACING.md },
  errorBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm },
  errorText:   { fontSize: FONT_SIZES.xs, flex: 1, lineHeight: 18 },
  fieldLabel:  { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.md, overflow: 'hidden', minHeight: 44 },
  noteRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: SPACING.sm },
  noteText:    { fontSize: 10, lineHeight: 16, flex: 1 },
  formActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  cancelFormBtn:{ flex: 1, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, alignItems: 'center', justifyContent: 'center' },
  cancelFormText:{ fontSize: FONT_SIZES.sm, fontWeight: '600' },
  saveFormBtn:  { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, borderRadius: RADIUS.md, paddingVertical: SPACING.sm },
  saveFormText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.sm },

  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.md },
  loadingText: { fontSize: FONT_SIZES.xs },

  emptyBox:  { alignItems: 'center', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.xl, borderStyle: 'dashed' },
  emptyText: { fontSize: FONT_SIZES.sm, fontWeight: '600' },
  emptySub:  { fontSize: FONT_SIZES.xs },

  networkList:       { borderWidth: 1, borderRadius: RADIUS.md, overflow: 'hidden' },
  networkRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md },
  networkIconCircle: { width: 30, height: 30, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  networkSsid:       { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  networkDate:       { fontSize: 10, marginTop: 2 },
  deleteBtn:         { width: 30, height: 30, borderRadius: RADIUS.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  networkDivider:    { height: 1 },
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
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
                <Text style={[ed.groupLabel, { color: theme.textMuted }]}>Target Values</Text>
              </View>
              <View style={ed.twoCol}>
                <NumInput label="Target Temp"     value={form.target_temp}     onChangeText={set('target_temp')}     suffix="°C" placeholder="-18" theme={theme} />
                <NumInput label="Target Humidity" value={form.target_humidity} onChangeText={set('target_humidity')} suffix="%" placeholder="60"   theme={theme} />
              </View>
              <View style={ed.groupHeader}>
                <Ionicons name="alert-circle-outline" size={14} color={theme.warning} />
                <Text style={[ed.groupLabel, { color: theme.textMuted }]}>Tolerance</Text>
              </View>
              <View style={ed.twoCol}>
                <NumInput label="Temp ±"     value={form.threshold_temp}     onChangeText={set('threshold_temp')}     suffix="°C" placeholder="3"  theme={theme} />
                <NumInput label="Humidity ±" value={form.threshold_humidity} onChangeText={set('threshold_humidity')} suffix="%" placeholder="10" theme={theme} />
              </View>

              {(form.target_temp !== '' || form.target_humidity !== '') && (
                <View style={[ed.rangePreview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
                  <View style={{ flex: 1 }}>
                    {form.target_temp !== '' && form.threshold_temp !== '' && !isNaN(parseFloat(form.target_temp)) && !isNaN(parseFloat(form.threshold_temp)) && (
                      <Text style={[ed.rangeText, { color: theme.textSecondary }]}>
                        Temp alert outside <Text style={{ fontWeight: '700', color: theme.text }}>
                          {(parseFloat(form.target_temp) - Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C – {(parseFloat(form.target_temp) + Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                        </Text>
                      </Text>
                    )}
                    {form.target_humidity !== '' && form.threshold_humidity !== '' && !isNaN(parseFloat(form.target_humidity)) && !isNaN(parseFloat(form.threshold_humidity)) && (
                      <Text style={[ed.rangeText, { color: theme.textSecondary }]}>
                        Humidity alert outside <Text style={{ fontWeight: '700', color: theme.text }}>
                          {(parseFloat(form.target_humidity) - Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}% – {(parseFloat(form.target_humidity) + Math.abs(parseFloat(form.threshold_humidity))).toFixed(1)}%
                        </Text>
                      </Text>
                    )}
                  </View>
                </View>
              )}

              <Button title="Save Changes" onPress={handleSave} loading={loading} style={{ marginTop: SPACING.md }} />

              {/* ── WiFi Networks Section ── */}
              <WifiNetworksSection deviceId={device?.device_id} theme={theme} />

              <Button title="Close" variant="ghost" onPress={onClose} style={{ marginTop: SPACING.lg, marginBottom: SPACING.xl }} />
            </ScrollView>
          </KeyboardAvoidingView>
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
  groupLabel:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
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
  const [showWifiModal,   setShowWifiModal]  = useState(false);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  const fetchDevices = async () => {
    if (USE_MOCK) {
      setExistingDevices([
        { id: 'mock-1', device_id: 'a1b2c3', name: 'Freezer Unit A', target_temp: -18, target_humidity: 60, threshold_temp: 3, threshold_humidity: 10 },
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

  const handleProvisioned = async (deviceId, targetFields) => {
    if (deviceId) {
      // Save device to Supabase with the target values from provisioning
      try {
        const fields = {
          device_id: deviceId,
          name: `Device ${deviceId}`, // Default name
          ...targetFields,
        };

        if (!USE_MOCK) {
          await addDevice(user.id, fields);
          fetchDevices(); // Refresh the device list
        } else {
          // For mock mode, add to local state
          setExistingDevices(prev => [{ id: String(Date.now()), ...fields, user_id: 'mock' }, ...prev]);
        }

        setSuccess(`Device "${deviceId}" provisioned and registered successfully!`);
      } catch (error) {
        setError(`Device provisioned but failed to save to database: ${error.message}`);
      }
    } else {
      setSuccess('Device provisioned! Enter the Device ID manually and fill in the remaining details.');
    }
  };

  const handleAdd = async () => {
    setError(''); setSuccess('');
    const trimmedId = form.device_id.trim();
    if (!trimmedId)        { setError('Device ID is required. Provision the device first or enter it manually.'); return; }
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
        setExistingDevices(prev => [{ id: String(Date.now()), ...fields, user_id: 'mock' }, ...prev]);
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

          {/* ══ FORM ══ */}
          <Card style={styles.formCard}>
            <View style={styles.cardTitleRow}>
              <SectionIcon ionicon="add-circle-outline" color={theme.primary} bg={theme.primaryLight} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Register New Device</Text>
                <Text style={[styles.cardSub, { color: theme.textSecondary }]}>Provision via WiFi, then fill in the details</Text>
              </View>
            </View>
            <Divider />

            {/* WiFi Provision button */}
            <TouchableOpacity
              onPress={() => setShowWifiModal(true)}
              style={[styles.provisionBtn, { backgroundColor: theme.primary }]}
            >
              <View style={styles.provisionLeft}>
                <View style={styles.provisionIconCircle}>
                  <Ionicons name="wifi" size={22} color="#fff" />
                </View>
                <View>
                  <Text style={styles.provisionTitle}>Set Up New Device</Text>
                  <Text style={styles.provisionSub}>WiFi provisioning — step by step</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            {/* Device ID */}
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>DEVICE ID *</Text>
            <View style={[
              styles.idBox,
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
                  onChangeText={(v) => setField('device_id')(v)}
                  placeholder="Auto-filled after provisioning, or type manually"
                  autoCapitalize="none"
                  noLabel
                  style={{ borderWidth: 0, backgroundColor: 'transparent' }}
                />
              )}
            </View>

            <Input label="Device Name *" value={form.name} onChangeText={setField('name')} placeholder="e.g. Freezer Unit A" autoCapitalize="words" />

            <View style={styles.groupHeader}>
              <Ionicons name="flag-outline" size={14} color={theme.primary} />
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>Target Values</Text>
            </View>
            <View style={styles.twoCol}>
              <NumInput label="Target Temp"     value={form.target_temp}     onChangeText={setField('target_temp')}     suffix="°C" placeholder="-18" theme={theme} />
              <NumInput label="Target Humidity" value={form.target_humidity} onChangeText={setField('target_humidity')} suffix="%"  placeholder="60"  theme={theme} />
            </View>
            <View style={styles.groupHeader}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.warning} />
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>Tolerance (±offset)</Text>
            </View>
            <View style={styles.twoCol}>
              <NumInput label="Temp ±"     value={form.threshold_temp}     onChangeText={setField('threshold_temp')}     suffix="°C" placeholder="3"  theme={theme} />
              <NumInput label="Humidity ±" value={form.threshold_humidity} onChangeText={setField('threshold_humidity')} suffix="%"  placeholder="10" theme={theme} />
            </View>

            {(form.target_temp !== '' || form.target_humidity !== '') && (
              <View style={[styles.rangePreview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
                <View style={{ flex: 1 }}>
                  {form.target_temp !== '' && form.threshold_temp !== '' && !isNaN(parseFloat(form.target_temp)) && !isNaN(parseFloat(form.threshold_temp)) && (
                    <Text style={[styles.rangeText, { color: theme.textSecondary }]}>
                      Temp alert outside{' '}
                      <Text style={{ fontWeight: '700', color: theme.text }}>
                        {(parseFloat(form.target_temp) - Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C – {(parseFloat(form.target_temp) + Math.abs(parseFloat(form.threshold_temp))).toFixed(1)}°C
                      </Text>
                    </Text>
                  )}
                  {form.target_humidity !== '' && form.threshold_humidity !== '' && !isNaN(parseFloat(form.target_humidity)) && !isNaN(parseFloat(form.threshold_humidity)) && (
                    <Text style={[styles.rangeText, { color: theme.textSecondary }]}>
                      Humidity alert outside{' '}
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
                Tap "Set Up New Device" to provision your sensor. The Device ID will be filled in automatically. Fields marked * are required.
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
                    <View style={[styles.deviceIcon, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="hardware-chip-outline" size={20} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deviceName, { color: theme.text }]}>{device.name || device.device_id}</Text>
                      <Text style={[styles.deviceId, { color: theme.textMuted }]}>ID: {device.device_id}</Text>
                      <View style={styles.chipRow}>
                        {device.target_temp      != null && <View style={[styles.chip, { backgroundColor: theme.primaryLight }]}><Ionicons name="flag-outline" size={10} color={theme.primary} /><Text style={[styles.chipText, { color: theme.primary }]}>{device.target_temp}°C</Text></View>}
                        {device.target_humidity  != null && <View style={[styles.chip, { backgroundColor: theme.primaryLight }]}><Ionicons name="water-outline" size={10} color={theme.primary} /><Text style={[styles.chipText, { color: theme.primary }]}>{device.target_humidity}%</Text></View>}
                        {device.threshold_temp   != null && <View style={[styles.chip, { backgroundColor: theme.warningBg   }]}><Ionicons name="alert-circle-outline" size={10} color={theme.warning} /><Text style={[styles.chipText, { color: theme.warning }]}>±{device.threshold_temp}°C</Text></View>}
                        {device.threshold_humidity != null && <View style={[styles.chip, { backgroundColor: theme.warningBg }]}><Ionicons name="alert-circle-outline" size={10} color={theme.warning} /><Text style={[styles.chipText, { color: theme.warning }]}>±{device.threshold_humidity}%</Text></View>}
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

      <WifiProvisionModal
        visible={showWifiModal}
        onClose={() => setShowWifiModal(false)}
        onProvisioned={handleProvisioned}
        theme={theme}
      />
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

  provisionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  provisionLeft:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  provisionIconCircle:{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  provisionTitle:     { color: '#fff', fontWeight: '800', fontSize: FONT_SIZES.base },
  provisionSub:       { color: 'rgba(255,255,255,0.75)', fontSize: FONT_SIZES.xs, marginTop: 2 },

  fieldLabel:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: SPACING.xs, marginTop: SPACING.sm },
  idBox:       { borderWidth: 1.5, borderRadius: RADIUS.md, minHeight: 48, justifyContent: 'center', overflow: 'hidden', marginBottom: SPACING.sm },
  idChip:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm, margin: SPACING.xs },
  idChipText:  { fontWeight: '700', fontSize: FONT_SIZES.sm, flex: 1 },

  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.md, marginBottom: SPACING.xs },
  groupLabel:  { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  twoCol:      { flexDirection: 'row', gap: SPACING.sm },
  hintRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, marginTop: SPACING.sm },
  hint:        { fontSize: FONT_SIZES.xs, lineHeight: 18, flex: 1 },
  rangePreview:{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm },
  rangeText:   { fontSize: FONT_SIZES.xs, lineHeight: 18, marginTop: 2 },

  deviceRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  deviceIcon:  { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  deviceName:  { fontSize: FONT_SIZES.base, fontWeight: '700' },
  deviceId:    { fontSize: FONT_SIZES.xs, marginTop: 2 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACING.xs },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACING.xs, paddingVertical: 2, borderRadius: RADIUS.sm },
  chipText:    { fontSize: 10, fontWeight: '700' },
  actionBtns:  { flexDirection: 'column', gap: SPACING.xs },
  iconBtn:     { width: 34, height: 34, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  innerDivider:{ height: 1, marginVertical: SPACING.xs },
});

export default AddDeviceScreen;
