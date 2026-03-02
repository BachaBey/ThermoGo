import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Platform, Dimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Detect platform inside browser ──────────────────────────────────────────
const getInstallPlatform = () => {
  if (Platform.OS !== 'web') return null;
  const ua = navigator.userAgent || '';
  const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  const isSafari  = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isChrome  = /Chrome/.test(ua);

  if (isIOS && isSafari) return 'ios';
  if (isAndroid && isChrome) return 'android';
  if (isAndroid) return 'android';
  return 'desktop'; // desktop browsers — skip prompt
};

const isRunningAsInstalled = () => {
  if (Platform.OS !== 'web') return true; // native app, no prompt needed
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
};

const STORAGE_KEY = 'thermogo_install_dismissed';

// ─── Step component ───────────────────────────────────────────────────────────
const Step = ({ number, icon, text, highlight, theme }) => (
  <View style={st.stepRow}>
    <View style={[st.stepNum, { backgroundColor: theme?.primary || '#3b82f6' }]}>
      <Text style={st.stepNumText}>{number}</Text>
    </View>
    <View style={st.stepBody}>
      <Text style={[st.stepText, { color: '#1e293b' }]}>
        {text}{' '}
        {highlight && (
          <View style={[st.pill, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
            <Ionicons name={icon} size={13} color="#475569" />
            <Text style={st.pillText}>{highlight}</Text>
          </View>
        )}
      </Text>
    </View>
  </View>
);
const st = StyleSheet.create({
  stepRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  stepNum:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText:{ color: '#fff', fontSize: 11, fontWeight: '800' },
  stepBody:   { flex: 1 },
  stepText:   { fontSize: 14, lineHeight: 20, color: '#1e293b' },
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillText:   { fontSize: 12, fontWeight: '600', color: '#475569' },
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const InstallPrompt = ({ appName = 'ThermoGo', appIcon, theme }) => {
  const [visible,      setVisible]      = useState(false);
  const [platform,     setPlatform]     = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null); // Android native prompt

  const slideAnim  = useRef(new Animated.Value(300)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isRunningAsInstalled()) return;

    // Check if user already dismissed
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) return;
    } catch (_) {}

    const p = getInstallPlatform();
    if (!p || p === 'desktop') return;

    setPlatform(p);

    // Android: intercept the native browser install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Show prompt after a short delay so the app loads first
    const timer = setTimeout(() => {
      setVisible(true);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      // Pulse the arrow/share icon to draw attention
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }, 2500);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const dismiss = (permanent = false) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 300, duration: 250, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));

    if (permanent) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
    }
  };

  // Android: trigger native browser install prompt
  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') dismiss(true);
      setDeferredPrompt(null);
    }
  };

  if (!visible || Platform.OS !== 'web') return null;

  const primary = theme?.primary || '#3b82f6';

  return (
    <>
      {/* Backdrop fade */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} pointerEvents="none" />

      {/* Bottom sheet */}
      <Animated.View style={[
        styles.sheet,
        { transform: [{ translateY: slideAnim }] },
      ]}>

        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          {/* App icon */}
          <View style={[styles.iconWrap, { backgroundColor: primary + '15', borderColor: primary + '30' }]}>
            {appIcon ? (
              <Image source={appIcon} style={styles.iconImg} />
            ) : (
              <Ionicons name="thermometer" size={28} color={primary} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Add {appName} to your home screen</Text>
            <Text style={styles.subtitle}>
              {platform === 'ios'
                ? 'Works like a real app — no App Store needed'
                : 'Install for the best experience — it\'s free'}
            </Text>
          </View>

          <TouchableOpacity onPress={() => dismiss(false)} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Instructions — platform specific */}
        {platform === 'ios' ? (
          <View style={styles.steps}>
            <Text style={styles.stepsTitle}>Follow these steps in Safari:</Text>
            <Step number="1" text="Tap the" icon="share-outline" highlight="Share" theme={theme} />
            <Step number="2" text="Scroll down and tap" icon="add-square-outline" highlight="Add to Home Screen" theme={theme} />
            <Step number="3" text="Tap" icon={null} highlight={null} theme={theme} />

            {/* Visual hint showing the share button location */}
            <View style={[styles.iosHint, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Ionicons name="share-outline" size={22} color={primary} />
              </Animated.View>
              <Text style={styles.iosHintText}>
                The{' '}
                <Text style={{ fontWeight: '700', color: primary }}>Share</Text>
                {' '}button is at the bottom of your Safari screen
              </Text>
            </View>

            <TouchableOpacity onPress={() => dismiss(true)} style={styles.dismissBtn}>
              <Text style={[styles.dismissText, { color: '#94a3b8' }]}>Don't show again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.steps}>
            {deferredPrompt ? (
              // Android with native prompt available — one-tap install
              <>
                <Text style={styles.stepsTitle}>Install in one tap:</Text>
                <TouchableOpacity
                  onPress={handleAndroidInstall}
                  style={[styles.installBtn, { backgroundColor: primary }]}
                >
                  <Ionicons name="download-outline" size={20} color="#fff" />
                  <Text style={styles.installBtnText}>Add to Home Screen</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => dismiss(true)} style={styles.dismissBtn}>
                  <Text style={[styles.dismissText, { color: '#94a3b8' }]}>Not now</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Android manual steps fallback
              <>
                <Text style={styles.stepsTitle}>Follow these steps in Chrome:</Text>
                <Step number="1" text="Tap the" icon="ellipsis-vertical" highlight="Menu (⋮)" theme={theme} />
                <Step number="2" text="Tap" icon="add-circle-outline" highlight="Add to Home screen" theme={theme} />
                <Step number="3" text="Tap" icon={null} highlight={null} theme={theme} />

                <View style={[styles.iosHint, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Ionicons name="ellipsis-vertical" size={22} color={primary} />
                  </Animated.View>
                  <Text style={styles.iosHintText}>
                    The{' '}
                    <Text style={{ fontWeight: '700', color: primary }}>Menu</Text>
                    {' '}button is at the top right of Chrome
                  </Text>
                </View>

                <TouchableOpacity onPress={() => dismiss(true)} style={styles.dismissBtn}>
                  <Text style={[styles.dismissText, { color: '#94a3b8' }]}>Don't show again</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position:        'absolute',
    top:             0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex:          999,
  },
  sheet: {
    position:           'absolute',
    bottom:             0, left: 0, right: 0,
    backgroundColor:    '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal:  20,
    paddingBottom:      36,
    paddingTop:         12,
    zIndex:             1000,
    shadowColor:        '#000',
    shadowOffset:       { width: 0, height: -4 },
    shadowOpacity:      0.12,
    shadowRadius:       16,
    elevation:          20,
    maxWidth:           520,
    alignSelf:          'center',
    width:              '100%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e2e8f0',
    alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  iconImg:  { width: 44, height: 44, borderRadius: 10 },
  title:    { fontSize: 16, fontWeight: '800', color: '#0f172a', lineHeight: 22 },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 18 },
  closeBtn: { padding: 4 },
  divider:  { height: 1, backgroundColor: '#f1f5f9', marginBottom: 16 },

  steps:      { gap: 0 },
  stepsTitle: { fontSize: 13, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  iosHint: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    borderWidth:    1,
    borderRadius:   12,
    padding:        12,
    marginTop:      8,
    marginBottom:   4,
  },
  iosHintText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },

  installBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 14,
    borderRadius:   14,
    marginBottom:   8,
  },
  installBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  dismissBtn:  { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  dismissText: { fontSize: 13, fontWeight: '500' },
});

export default InstallPrompt;
