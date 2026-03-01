import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { useAuth } from '../services/AuthContext';
import {
  getUserDevices,
  getLatestReading,
  subscribeToSensorReadings,
} from '../services/supabase';
import { MOCK_DEVICES, MOCK_LATEST_READING } from '../services/mockData';
import { Card, Badge } from '../components/UI';
import DeviceSelector from '../components/DeviceSelector';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

// Set to false once you have replaced SUPABASE_URL in services/supabase.js
const USE_MOCK = false;

// ─── Small metric card ────────────────────────────────────────────────────────
const MetricCard = ({ label, value, unit, ionicon, status, statusLabel }) => {
  const { theme } = useTheme();
  const colorMap = { good: theme.success, warning: theme.warning, danger: theme.danger, neutral: theme.primary };
  const bgMap    = { good: theme.successBg, warning: theme.warningBg, danger: theme.dangerBg, neutral: theme.primaryLight };
  const typeMap  = { good: 'success', warning: 'warning', danger: 'danger', neutral: 'info' };
  const iconColor = colorMap[status] || theme.primary;
  const iconBg    = bgMap[status]    || theme.primaryLight;
  return (
    <Card style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricIconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={ionicon} size={22} color={iconColor} />
        </View>
        <Badge label={statusLabel} type={typeMap[status] || 'info'} />
      </View>
      <Text style={[styles.metricValue, { color: iconColor }]}>
        {value}
        <Text style={[styles.metricUnit, { color: theme.textSecondary }]}>{unit}</Text>
      </Text>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
    </Card>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTempStatus = (t) => {
  if (t == null) return 'neutral';
  if (t < -25 || t > -10) return 'danger';
  if (t < -22 || t > -15) return 'warning';
  return 'good';
};
const getTempLabel = (t) => {
  if (t < -25 || t > -10) return 'Critical';
  if (t < -22 || t > -15) return 'Warning';
  return 'Normal';
};
const getHumidityStatus = (h) => {
  if (h == null) return 'neutral';
  if (h < 30 || h > 90) return 'danger';
  if (h < 40 || h > 80) return 'warning';
  return 'good';
};

// ─── Screen ───────────────────────────────────────────────────────────────────
const CurrentStatusScreen = () => {
  const { theme } = useTheme();
  const { user, profile } = useAuth();

  const [devices,        setDevices]        = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [reading,        setReading]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [lastUpdated,    setLastUpdated]    = useState(null);

  const channelRef = useRef(null);

  // ── Fetch device list ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (USE_MOCK) {
        setDevices(MOCK_DEVICES);
        setSelectedDevice(MOCK_DEVICES[0]);
        return;
      }
      const { data } = await getUserDevices(user.id);
      if (data?.length) {
        setDevices(data);
        setSelectedDevice(data[0]);
      }
    };
    load();
  }, [user]);

  // ── Fetch latest reading for selected device ───────────────────────────────
  const fetchReading = useCallback(async () => {
    if (!selectedDevice) return;
    if (USE_MOCK) {
      setReading({
        ...MOCK_LATEST_READING,
        temperature: parseFloat((MOCK_LATEST_READING.temperature + (Math.random() * 0.4 - 0.2)).toFixed(2)),
        humidity:    parseFloat((MOCK_LATEST_READING.humidity    + (Math.random() * 1 - 0.5)).toFixed(2)),
        created_at:  new Date().toISOString(),
      });
      setLastUpdated(new Date());
      setLoading(false);
      return;
    }
    // selectedDevice.id is the uuid PK of the devices row
    const { data } = await getLatestReading(selectedDevice.id);
    if (data) { setReading(data); setLastUpdated(new Date()); }
    setLoading(false);
  }, [selectedDevice]);

  useEffect(() => {
    setLoading(true);
    fetchReading();
  }, [fetchReading]);

  // ── Realtime subscription (INSERT on sensor_readings) ─────────────────────
  useEffect(() => {
    if (USE_MOCK || !selectedDevice) return;

    // Clean up previous subscription before creating a new one
    if (channelRef.current) channelRef.current.unsubscribe();

    channelRef.current = subscribeToSensorReadings((payload) => {
      // Only update UI if the new reading belongs to the currently selected device
      if (payload.new?.device_id === selectedDevice.id) {
        setReading(payload.new);
        setLastUpdated(new Date());
      }
    });

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [selectedDevice]);

  // ── Mock auto-refresh every 30 s ──────────────────────────────────────────
  useEffect(() => {
    if (!USE_MOCK) return;
    const interval = setInterval(fetchReading, 30000);
    return () => clearInterval(interval);
  }, [fetchReading]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReading();
    setRefreshing(false);
  };

  const formatTime = (d) =>
    d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

        {/* Greeting */}
        {profile && (
          <View style={styles.greetingRow}>
            <Ionicons name="sunny-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>
              Hello, {profile.first_name}
            </Text>
          </View>
        )}

        {/* Device selector */}
        <DeviceSelector
          devices={devices}
          selectedDevice={selectedDevice}
          onSelect={setSelectedDevice}
        />

        {devices.length === 0 ? (
          <Card>
            <Text style={{ textAlign: 'center', color: theme.textSecondary, fontSize: FONT_SIZES.base }}>
              No devices registered yet.{'\n'}Go to "Add Device" to get started.
            </Text>
          </Card>
        ) : (
          <>
            {/* Live indicator */}
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.liveText, { color: theme.textSecondary }]}>
                Live · Updated {formatTime(lastUpdated)}
              </Text>
            </View>

            {loading ? (
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading...</Text>
            ) : reading ? (
              <>
                {/* Temperature */}
                <MetricCard
                  label="Current Temperature"
                  value={Number(reading.temperature).toFixed(1)}
                  unit="°C"
                  ionicon="thermometer"
                  status={getTempStatus(reading.temperature)}
                  statusLabel={getTempLabel(reading.temperature)}
                />

                {/* Humidity */}
                <MetricCard
                  label="Relative Humidity"
                  value={Number(reading.humidity).toFixed(1)}
                  unit="%"
                  ionicon="water"
                  status={getHumidityStatus(reading.humidity)}
                  statusLabel={
                    getHumidityStatus(reading.humidity) === 'good' ? 'Normal'
                    : getHumidityStatus(reading.humidity) === 'warning' ? 'Warning' : 'Critical'
                  }
                />

                {/* Device info */}
                <Card style={styles.infoCard}>
                  <Text style={[styles.infoTitle, { color: theme.textMuted }]}>Device Info</Text>
                  {[
                    ['Hardware ID', selectedDevice?.device_id],
                    ['Last Reading', reading.created_at ? new Date(reading.created_at).toLocaleString() : '--'],
                    ['Connected', selectedDevice?.connected_at ? new Date(selectedDevice.connected_at).toLocaleDateString() : '--'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.infoRow}>
                      <Text style={[styles.infoKey, { color: theme.textSecondary }]}>{k}</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{v}</Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : (
              <Card>
                <Text style={{ textAlign: 'center', color: theme.textSecondary }}>
                  No readings yet for this device.
                </Text>
              </Card>
            )}
          </>
        )}


      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: SPACING.base, paddingTop: SPACING.lg, paddingBottom: 80 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md },
  greeting: { fontSize: FONT_SIZES.base, fontWeight: '500' },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.xs },
  liveText: { fontSize: FONT_SIZES.sm, fontWeight: '500' },
  metricCard: { marginBottom: SPACING.md },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  metricIconCircle: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  metricValue: { fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  metricUnit: { fontSize: FONT_SIZES.xl, fontWeight: '400' },
  metricLabel: { fontSize: FONT_SIZES.sm, marginTop: SPACING.xs, fontWeight: '500' },
  infoCard: { marginTop: 0 },
  infoTitle: { fontSize: FONT_SIZES.xs, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: SPACING.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  infoKey: { fontSize: FONT_SIZES.sm },
  infoValue: { fontSize: FONT_SIZES.sm, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: SPACING.sm },
  loadingText: { textAlign: 'center', marginTop: SPACING.xl },
});

export default CurrentStatusScreen;
