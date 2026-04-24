import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons }  from '@expo/vector-icons';
import { useTheme }  from '../styles/ThemeContext';
import { useAuth }   from '../services/AuthContext';
import {
  supabase,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/supabase';
import { Divider } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const USE_MOCK = false;

// ─── Type config ──────────────────────────────────────────────────────────────
const NOTIFICATION_CONFIG = {
  critical_temp: {
    ionicon:  'thermometer',
    label:    'Temp Alert',
    type:     'danger',
    bgKey:    'dangerBg',
    colorKey: 'danger',
  },
  low_humidity: {
    ionicon:  'water',
    label:    'Humidity Alert',
    type:     'warning',
    bgKey:    'warningBg',
    colorKey: 'warning',
  },
  low_battery: {
    ionicon:  'battery-dead',
    label:    'Low Battery',
    type:     'warning',
    bgKey:    'warningBg',
    colorKey: 'warning',
  },
  offline: {
    ionicon:  'wifi-outline',
    label:    'Offline',
    type:     'danger',
    bgKey:    'dangerBg',
    colorKey: 'danger',
  },
  info: {
    ionicon:  'information-circle',
    label:    'Info',
    type:     'info',
    bgKey:    'infoBg',
    colorKey: 'info',
  },
};

// ─── Filter definitions ───────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',           label: 'All',      ionicon: 'list-outline'        },
  { key: 'unread',        label: 'Unread',   ionicon: 'ellipse'              },
  { key: 'critical_temp', label: 'Temp',     ionicon: 'thermometer-outline'  },
  { key: 'low_humidity',  label: 'Humidity', ionicon: 'water-outline'        },
  { key: 'low_battery',   label: 'Battery',  ionicon: 'battery-dead-outline' },
];

const formatRelativeTime = (dateStr) => {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(dateStr)) / 1000));
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ═════════════════════════════════════════════════════════════════════════════
// Single notification row
// ═════════════════════════════════════════════════════════════════════════════
const NotificationItem = ({ item, onRead }) => {
  const { theme } = useTheme();
  const config = NOTIFICATION_CONFIG[item.type] || NOTIFICATION_CONFIG.info;

  const iconBg    = theme[config.bgKey]    || theme.infoBg;
  const iconColor = theme[config.colorKey] || theme.info;
  const leftColor =
    config.type === 'danger'  ? theme.danger  :
    config.type === 'warning' ? theme.warning :
    theme.info;

  const handlePress = () => {
    if (!item.is_read) onRead(item.id);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={item.is_read ? 1 : 0.7}
      style={[
        styles.notifItem,
        {
          backgroundColor: item.is_read ? theme.surface : theme.primaryLight,
          borderColor:     theme.border,
          borderLeftColor: leftColor,
        },
      ]}
    >
      {/* Icon circle */}
      <View style={styles.notifIconWrap}>
        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={config.ionicon} size={20} color={iconColor} />
        </View>
        {!item.is_read && (
          <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <View style={styles.notifTopRow}>
          {/* Badge */}
          <View style={[styles.badge, {
            backgroundColor: iconBg,
            borderColor: iconColor + '40',
          }]}>
            <Text style={[styles.badgeText, { color: iconColor }]}>{config.label}</Text>
          </View>

          <View style={styles.metaRight}>
            {!item.is_read && (
              <Text style={[styles.tapHint, { color: theme.textMuted }]}>Tap to dismiss</Text>
            )}
            <Text style={[styles.timeText, { color: theme.textMuted }]}>
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
        </View>

        <Text style={[styles.notifMessage, { color: theme.text }]} numberOfLines={3}>
          {item.message}
        </Text>

        {/* Device name */}
        {(item.devices?.name || item.devices?.device_id) && (
          <View style={styles.deviceRow}>
            <Ionicons name="hardware-chip-outline" size={12} color={theme.textSecondary} />
            <Text style={[styles.deviceLabel, { color: theme.textSecondary }]}>
              {item.devices?.name || item.devices?.device_id}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Screen
// ═════════════════════════════════════════════════════════════════════════════
const NotificationsScreen = () => {
  const { theme } = useTheme();
  const { user }  = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [filter,        setFilter]        = useState('all');
  const [markingAll,    setMarkingAll]    = useState(false);
  const [error,         setError]         = useState(null);

  const channelRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = async () => {
    if (USE_MOCK) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    if (!user) return;
    const { data, error: fetchErr } = await getNotifications(user.id);
    if (fetchErr) { setError('Failed to load alerts. Pull down to retry.'); setLoading(false); return; }
    setError(null);
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchNotifications(); }, [user]);

  // ── Realtime: listen for new INSERTs from the DB trigger ──────────────────
  useEffect(() => {
    if (!user || USE_MOCK) return;
    if (channelRef.current) { channelRef.current.unsubscribe(); }

    channelRef.current = supabase
      .channel(`notifications-live-${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Fetch full row with joined device info
          supabase
            .from('notifications')
            .select('*, devices(device_id, name)')
            .eq('id', payload.new.id)
            .single()
            .then(({ data }) => {
              if (data) setNotifications(prev => [data, ...prev]);
            });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
    };
  }, [user]);

  // ── Mark single as read ────────────────────────────────────────────────────
  const handleRead = async (id) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    await markNotificationRead(id);
  };

  // ── Mark all as read ───────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await markAllNotificationsRead(user.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setMarkingAll(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  // ── Filter logic ───────────────────────────────────────────────────────────
  const filtered = notifications.filter((n) => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.is_read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>

      {/* ── Header ── */}
      <View style={[styles.headerBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

          {/* Title row */}
          <View style={styles.headerTop}>
            <View style={styles.titleRow}>
              <Ionicons name="notifications" size={22} color={theme.primary} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>Alerts</Text>
              {unreadCount > 0 && (
                <View style={[styles.countBadge, { backgroundColor: theme.danger }]}>
                  <Text style={styles.countText}>{unreadCount}</Text>
                </View>
              )}
            </View>

            {/* Mark all read */}
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleMarkAllRead}
                disabled={markingAll}
                style={[styles.markAllBtn, { borderColor: theme.primary }]}
              >
                <Ionicons name="checkmark-done-outline" size={14} color={theme.primary} />
                <Text style={[styles.markAllText, { color: theme.primary }]}>
                  {markingAll ? 'Clearing...' : 'Mark all read'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filter pills */}
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[
                    styles.filterBtn,
                    {
                      backgroundColor: active ? theme.primary : theme.surfaceAlt,
                      borderColor:     active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Ionicons name={f.ionicon} size={14} color={active ? '#fff' : theme.textSecondary} />
                  <Text style={[styles.filterText, { color: active ? '#fff' : theme.textSecondary }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Error banner ── */}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerBg, borderColor: theme.danger, marginHorizontal: SPACING.base, marginTop: SPACING.md }]}>
          <Ionicons name="warning-outline" size={16} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
        </View>
      )}

      {/* ── List ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: theme.surfaceAlt }]}>
              <Ionicons name="notifications-off-outline" size={40} color={theme.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No alerts</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              {filter === 'all'
                ? 'All clear! Alerts appear here when your sensors are out of range.'
                : 'No alerts match this filter.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <NotificationItem item={item} onRead={handleRead} />
        )}
        ItemSeparatorComponent={() => (
          <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>
            <Divider />
          </View>
        )}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  headerBar: {
    paddingHorizontal: SPACING.base,
    paddingTop:        SPACING.base,
    paddingBottom:     SPACING.md,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  headerTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700' },
  countBadge: {
    minWidth:  22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  countText:    { color: '#fff', fontSize: FONT_SIZES.xs, fontWeight: '700' },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
  },
  markAllText:  { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  // Filters
  filterRow: { flexDirection: 'row', gap: SPACING.xs },
  filterBtn: {
    flex:             1,
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              4,
    paddingVertical:  SPACING.sm + 2,
    borderRadius:     RADIUS.md,
    borderWidth:      1.5,
  },
  filterText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  // List
  listContent: {
    padding:       SPACING.base,
    paddingBottom: 80,
    maxWidth:      CONTENT_MAX_WIDTH,
    width:         '100%',
    alignSelf:     'center',
  },

  // Notification item
  notifItem: {
    flexDirection:   'row',
    gap:             SPACING.md,
    padding:         SPACING.md,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderLeftWidth: 4,
    marginVertical:  SPACING.xs,
  },
  notifIconWrap: { position: 'relative' },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute', top: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: 'white',
  },
  notifTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACING.xs,
  },
  badge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  badgeText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  metaRight: { alignItems: 'flex-end', gap: 2 },
  tapHint:   { fontSize: 9, fontStyle: 'italic' },
  timeText:  { fontSize: FONT_SIZES.xs, fontWeight: '500' },
  notifMessage: { fontSize: FONT_SIZES.sm, lineHeight: 20, marginBottom: SPACING.xs },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  deviceLabel: { fontSize: FONT_SIZES.xs, fontWeight: '500' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: SPACING['3xl'], gap: SPACING.md },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle:    { fontSize: FONT_SIZES.lg,  fontWeight: '700' },
  emptySubtitle: { fontSize: FONT_SIZES.base, textAlign: 'center', paddingHorizontal: SPACING.xl },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '500' },
});

export default NotificationsScreen;
