import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons }  from '@expo/vector-icons';
import { useTheme }  from '../styles/ThemeContext';
import { useAuth }   from '../services/AuthContext';
import { supabase }  from '../services/supabase';
import { MOCK_NOTIFICATIONS } from '../services/mockData';
import { Badge, Divider } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const USE_MOCK = false;

// ─── Notification type → icon + label + badge type ────────────────────────────
const NOTIFICATION_CONFIG = {
  critical_temp: {
    ionicon:  'thermometer',
    label:    'Critical Temp',
    type:     'danger',
    bgKey:    'dangerBg',
    colorKey: 'danger',
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
  { key: 'all',           label: 'All',     ionicon: 'list-outline'         },
  { key: 'unread',        label: 'Unread',  ionicon: 'ellipse'               },
  { key: 'critical_temp', label: 'Temp',    ionicon: 'thermometer-outline'   },
  { key: 'low_battery',   label: 'Battery', ionicon: 'battery-dead-outline'  },
];

const formatRelativeTime = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ═════════════════════════════════════════════════════════════════════════════
// Single notification row
// ═════════════════════════════════════════════════════════════════════════════
const NotificationItem = ({ item }) => {
  const { theme } = useTheme();
  const config = NOTIFICATION_CONFIG[item.type] || NOTIFICATION_CONFIG.info;

  const iconBg    = theme[config.bgKey]    || theme.infoBg;
  const iconColor = theme[config.colorKey] || theme.info;
  const leftBorderColor =
    config.type === 'danger'  ? theme.danger  :
    config.type === 'warning' ? theme.warning :
    theme.info;

  return (
    <View style={[
      styles.notifItem,
      {
        backgroundColor: item.is_read ? theme.surface : theme.primaryLight,
        borderColor:     theme.border,
        borderLeftColor: leftBorderColor,
      },
    ]}>

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
          <Badge label={config.label} type={config.type} />
          <Text style={[styles.timeText, { color: theme.textMuted }]}>
            {formatRelativeTime(item.created_at)}
          </Text>
        </View>

        <Text style={[styles.notifMessage, { color: theme.text }]} numberOfLines={3}>
          {item.message}
        </Text>

        {item.devices?.device_id && (
          <View style={styles.deviceRow}>
            <Ionicons name="hardware-chip-outline" size={12} color={theme.textSecondary} />
            <Text style={[styles.deviceLabel, { color: theme.textSecondary }]}>
              {item.devices.device_id}
            </Text>
          </View>
        )}
      </View>
    </View>
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

  const channelRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = async () => {
    if (USE_MOCK) {
      setNotifications(MOCK_NOTIFICATIONS);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('notifications')
      .select('*, devices(device_id)')
      .order('created_at', { ascending: false });
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchNotifications(); }, []);

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || USE_MOCK) return;
    if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }

    channelRef.current = supabase
      .channel('notifications-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => setNotifications((prev) => [payload.new, ...prev])
      )
      .subscribe();

    return () => {
      if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
    };
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.is_read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>

      {/* Header */}
      <View style={[styles.headerBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

          {/* Title + unread badge */}
          <View style={styles.headerTop}>
            <View style={styles.titleRow}>
              <Ionicons name="notifications" size={22} color={theme.primary} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>Alerts</Text>
            </View>
            {unreadCount > 0 && (
              <View style={[styles.countBadge, { backgroundColor: theme.danger }]}>
                <Text style={styles.countText}>{unreadCount}</Text>
              </View>
            )}
          </View>

          {/* Filter buttons */}
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
                  <Ionicons
                    name={f.ionicon}
                    size={15}
                    color={active ? '#ffffff' : theme.textSecondary}
                  />
                  <Text style={[styles.filterText, { color: active ? '#fff' : theme.textSecondary }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* List */}
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
                ? "You're all clear! Alerts will appear here."
                : 'No alerts match this filter.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => <NotificationItem item={item} />}
        ItemSeparatorComponent={() => (
          <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>
            <Divider />
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // ── Header ─────────────────────────────────────────────────────────────────
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
  headerTitle: {
    fontSize:   FONT_SIZES.xl,
    fontWeight: '700',
  },
  countBadge: {
    minWidth:         26,
    height:           26,
    borderRadius:     13,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: SPACING.xs,
  },
  countText: {
    color:      '#fff',
    fontSize:   FONT_SIZES.xs,
    fontWeight: '700',
  },

  // ── Filter buttons ─────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    gap:           SPACING.xs,
  },
  filterBtn: {
    flex:             1,
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              SPACING.xs,
    paddingHorizontal: SPACING.xs,
    paddingVertical:   SPACING.sm + 2,   // taller than before
    borderRadius:      RADIUS.md,
    borderWidth:       1.5,
  },
  filterText: {
    fontSize:   FONT_SIZES.xs,
    fontWeight: '700',
  },

  // ── List ───────────────────────────────────────────────────────────────────
  listContent: {
    padding:       SPACING.base,
    paddingBottom: 80,
    maxWidth:      CONTENT_MAX_WIDTH,
    width:         '100%',
    alignSelf:     'center',
  },

  // ── Notification item ──────────────────────────────────────────────────────
  notifItem: {
    flexDirection:  'row',
    gap:            SPACING.md,
    padding:        SPACING.md,
    borderRadius:   RADIUS.md,
    borderWidth:    1,
    borderLeftWidth:4,
    marginVertical: SPACING.xs,
  },
  notifIconWrap: {
    position: 'relative',
  },
  iconCircle: {
    width:          44,
    height:         44,
    borderRadius:   22,
    alignItems:     'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position:    'absolute',
    top:         0,
    right:       0,
    width:       11,
    height:      11,
    borderRadius:6,
    borderWidth: 2,
    borderColor: 'white',
  },
  notifTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACING.xs,
  },
  timeText:     { fontSize: FONT_SIZES.xs, fontWeight: '500' },
  notifMessage: { fontSize: FONT_SIZES.sm, lineHeight: 20, marginBottom: SPACING.xs },
  deviceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     2,
  },
  deviceLabel: { fontSize: FONT_SIZES.xs, fontWeight: '500' },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyState: {
    alignItems:  'center',
    paddingTop:  SPACING['3xl'],
    gap:         SPACING.md,
  },
  emptyIconCircle: {
    width:          80,
    height:         80,
    borderRadius:   40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyTitle:    { fontSize: FONT_SIZES.lg,  fontWeight: '700' },
  emptySubtitle: { fontSize: FONT_SIZES.base, textAlign: 'center', paddingHorizontal: SPACING.xl },
});

export default NotificationsScreen;
