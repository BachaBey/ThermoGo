import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  TouchableOpacity, Modal, Pressable, FlatList,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons }   from '@expo/vector-icons';
import { useTheme }   from '../styles/ThemeContext';
import { useAuth }    from '../services/AuthContext';
import { getUserDevices, getSensorHistory } from '../services/supabase';
import { MOCK_DEVICES, generateMockHistory } from '../services/mockData';
import { Card } from '../components/UI';
import DeviceSelector from '../components/DeviceSelector';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const USE_MOCK = false;

const CHART_WIDTH = Math.min(
  Dimensions.get('window').width - SPACING.base * 2,
  CONTENT_MAX_WIDTH
) - SPACING.lg * 2;

// ─── Date/time helpers ────────────────────────────────────────────────────────
const daysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth()    === b.getMonth()    &&
  a.getDate()     === b.getDate();

const formatDisplay = (date) => {
  if (!date) return '—';
  return `${MONTH_NAMES[date.getMonth()].slice(0,3)} ${date.getDate()}, ${date.getFullYear()}`;
};

const formatTimeDisplay = (h, m) =>
  `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR PICKER MODAL  — 3 views: DAY  |  MONTH  |  YEAR
// ═════════════════════════════════════════════════════════════════════════════

// Range of years to show in the year picker (past 20 → current)
const buildYearRange = () => {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current - 20; y <= current; y++) years.push(y);
  return years;
};
const YEAR_RANGE = buildYearRange();

const CalendarPicker = ({ visible, value, onSelect, onClose, theme }) => {
  const today = new Date();

  // 'day' | 'month' | 'year'
  const [view,      setView]      = useState('day');
  const [viewYear,  setViewYear]  = useState((value || today).getFullYear());
  const [viewMonth, setViewMonth] = useState((value || today).getMonth());

  // Sync when modal opens
  useEffect(() => {
    if (visible) {
      const ref = value || today;
      setViewYear(ref.getFullYear());
      setViewMonth(ref.getMonth());
      setView('day');
    }
  }, [visible]);

  // ── Nav (day view only) ────────────────────────────────────────────────────
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // ── Day grid ───────────────────────────────────────────────────────────────
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  // ── Shared header ──────────────────────────────────────────────────────────
  const Header = () => (
    <View style={cal.header}>
      {/* Back arrow — only in day view */}
      {view === 'day' ? (
        <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => setView('day')} style={cal.navBtn}>
          <Ionicons name="arrow-back-outline" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Clickable Month + Year — each opens its own picker */}
      <View style={cal.headerCenter}>
        <TouchableOpacity
          onPress={() => setView(view === 'month' ? 'day' : 'month')}
          style={[cal.headerChip, view === 'month' && { backgroundColor: theme.primaryLight }]}
        >
          <Text style={[cal.headerChipText, { color: view === 'month' ? theme.primary : theme.text }]}>
            {MONTH_NAMES[viewMonth]}
          </Text>
          <Ionicons
            name={view === 'month' ? 'chevron-up' : 'chevron-down'}
            size={13} color={view === 'month' ? theme.primary : theme.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setView(view === 'year' ? 'day' : 'year')}
          style={[cal.headerChip, view === 'year' && { backgroundColor: theme.primaryLight }]}
        >
          <Text style={[cal.headerChipText, { color: view === 'year' ? theme.primary : theme.text }]}>
            {viewYear}
          </Text>
          <Ionicons
            name={view === 'year' ? 'chevron-up' : 'chevron-down'}
            size={13} color={view === 'year' ? theme.primary : theme.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Forward arrow — only in day view */}
      {view === 'day' ? (
        <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={theme.primary} />
        </TouchableOpacity>
      ) : (
        <View style={cal.navBtn} />
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cal.overlay} onPress={onClose}>
        <Pressable style={[cal.modal, { backgroundColor: theme.surface, borderColor: theme.border }]}>

          <Header />

          {/* ── MONTH VIEW ── */}
          {view === 'month' && (
            <View style={cal.monthGrid}>
              {MONTH_NAMES.map((name, i) => {
                const active = i === viewMonth;
                const isFutureMonth = viewYear === today.getFullYear() && i > today.getMonth();
                return (
                  <TouchableOpacity
                    key={name}
                    disabled={isFutureMonth}
                    onPress={() => { setViewMonth(i); setView('day'); }}
                    style={[
                      cal.monthCell,
                      active && { backgroundColor: theme.primary, borderRadius: RADIUS.md },
                    ]}
                  >
                    <Text style={[
                      cal.monthCellText,
                      { color: active ? '#fff' : isFutureMonth ? theme.textMuted : theme.text },
                    ]}>
                      {name.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── YEAR VIEW ── */}
          {view === 'year' && (
            <ScrollView style={cal.yearScroll} showsVerticalScrollIndicator={false}>
              <View style={cal.yearGrid}>
                {YEAR_RANGE.map((y) => {
                  const active = y === viewYear;
                  return (
                    <TouchableOpacity
                      key={y}
                      onPress={() => { setViewYear(y); setView('day'); }}
                      style={[
                        cal.yearCell,
                        active && { backgroundColor: theme.primary, borderRadius: RADIUS.md },
                      ]}
                    >
                      <Text style={[
                        cal.yearCellText,
                        { color: active ? '#fff' : theme.text },
                        y === today.getFullYear() && !active && { color: theme.primary, fontWeight: '700' },
                      ]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* ── DAY VIEW ── */}
          {view === 'day' && (
            <>
              {/* Day-of-week labels */}
              <View style={cal.dayLabels}>
                {DAY_NAMES.map(d => (
                  <Text key={d} style={[cal.dayLabel, { color: theme.textMuted }]}>{d}</Text>
                ))}
              </View>

              {/* Day grid */}
              <View style={cal.grid}>
                {cells.map((date, i) => {
                  if (!date) return <View key={`e-${i}`} style={cal.cell} />;
                  const isSelected = value && sameDay(date, value);
                  const isToday    = sameDay(date, today);
                  const isFuture   = date > today;
                  return (
                    <TouchableOpacity
                      key={date.toISOString()}
                      onPress={() => { if (!isFuture) { onSelect(date); onClose(); } }}
                      disabled={isFuture}
                      style={[
                        cal.cell,
                        isSelected && { backgroundColor: theme.primary, borderRadius: RADIUS.full },
                      ]}
                    >
                      <Text style={[
                        cal.cellText,
                        { color: isSelected ? '#fff' : isFuture ? theme.textMuted : theme.text },
                        isToday && !isSelected && { color: theme.primary, fontWeight: '700' },
                      ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Today shortcut */}
              <TouchableOpacity
                onPress={() => { onSelect(today); onClose(); }}
                style={[cal.todayBtn, { borderColor: theme.primary }]}
              >
                <Text style={[cal.todayBtnText, { color: theme.primary }]}>Today</Text>
              </TouchableOpacity>
            </>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
};

const cal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl,
  },
  modal: {
    width: '100%', maxWidth: 340,
    borderRadius: RADIUS.xl, borderWidth: 1,
    padding: SPACING.lg,
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: SPACING.md,
  },
  navBtn:       { padding: SPACING.sm, width: 36, alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flex: 1, justifyContent: 'center' },
  headerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  headerChipText: { fontSize: FONT_SIZES.base, fontWeight: '700' },
  // Month grid (3×4)
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.sm },
  monthCell: {
    width: '25%', paddingVertical: SPACING.md,
    alignItems: 'center', justifyContent: 'center',
  },
  monthCellText: { fontSize: FONT_SIZES.sm, fontWeight: '600' },
  // Year grid
  yearScroll: { maxHeight: 220 },
  yearGrid:   { flexDirection: 'row', flexWrap: 'wrap' },
  yearCell: {
    width: '25%', paddingVertical: SPACING.md,
    alignItems: 'center', justifyContent: 'center',
  },
  yearCellText: { fontSize: FONT_SIZES.sm, fontWeight: '600' },
  // Day grid
  dayLabels:   { flexDirection: 'row', marginBottom: SPACING.xs },
  dayLabel: {
    flex: 1, textAlign: 'center',
    fontSize: FONT_SIZES.xs, fontWeight: '600',
  },
  grid:     { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100/7}%`, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cellText: { fontSize: FONT_SIZES.sm },
  todayBtn: {
    alignSelf: 'center', marginTop: SPACING.md,
    borderWidth: 1.5, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs,
  },
  todayBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
});

// ═════════════════════════════════════════════════════════════════════════════
// TIME PICKER MODAL  (scrollable HH : MM columns)
// ═════════════════════════════════════════════════════════════════════════════
const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const TimePicker = ({ visible, hour, minute, onSelect, onClose, theme }) => {
  const [selH, setSelH] = useState(hour);
  const [selM, setSelM] = useState(minute);

  const hourRef   = useRef(null);
  const minuteRef = useRef(null);

  // Sync when modal opens
  useEffect(() => {
    if (visible) {
      setSelH(hour);
      setSelM(minute);
      // Scroll to current values after short delay
      setTimeout(() => {
        hourRef.current?.scrollToIndex({ index: hour,   animated: false, viewPosition: 0.4 });
        minuteRef.current?.scrollToIndex({ index: minute, animated: false, viewPosition: 0.4 });
      }, 120);
    }
  }, [visible]);

  const ITEM_H = 44;

  const renderHour = ({ item }) => {
    const active = item === selH;
    return (
      <TouchableOpacity
        onPress={() => setSelH(item)}
        style={[tp.item, { backgroundColor: active ? theme.primary : 'transparent' }]}
      >
        <Text style={[tp.itemText, { color: active ? '#fff' : theme.text, fontWeight: active ? '700' : '400' }]}>
          {String(item).padStart(2, '0')}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMinute = ({ item }) => {
    const active = item === selM;
    return (
      <TouchableOpacity
        onPress={() => setSelM(item)}
        style={[tp.item, { backgroundColor: active ? theme.primary : 'transparent' }]}
      >
        <Text style={[tp.itemText, { color: active ? '#fff' : theme.text, fontWeight: active ? '700' : '400' }]}>
          {String(item).padStart(2, '0')}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={tp.overlay} onPress={onClose}>
        <Pressable style={[tp.modal, { backgroundColor: theme.surface, borderColor: theme.border }]}>

          <Text style={[tp.title, { color: theme.text }]}>Select Time</Text>

          {/* Preview */}
          <View style={[tp.preview, { backgroundColor: theme.primaryLight }]}>
            <Text style={[tp.previewText, { color: theme.primary }]}>
              {String(selH).padStart(2,'0')} : {String(selM).padStart(2,'0')}
            </Text>
          </View>

          {/* Columns */}
          <View style={tp.columns}>
            {/* Hours */}
            <View style={tp.columnWrap}>
              <Text style={[tp.colLabel, { color: theme.textMuted }]}>Hour</Text>
              <View style={[tp.column, { borderColor: theme.border }]}>
                <FlatList
                  ref={hourRef}
                  data={HOURS}
                  keyExtractor={String}
                  renderItem={renderHour}
                  getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
                  showsVerticalScrollIndicator={false}
                  style={{ height: ITEM_H * 5 }}
                  initialScrollIndex={Math.max(0, selH - 2)}
                  onScrollToIndexFailed={() => {}}
                />
              </View>
            </View>

            <Text style={[tp.colon, { color: theme.text }]}>:</Text>

            {/* Minutes */}
            <View style={tp.columnWrap}>
              <Text style={[tp.colLabel, { color: theme.textMuted }]}>Min</Text>
              <View style={[tp.column, { borderColor: theme.border }]}>
                <FlatList
                  ref={minuteRef}
                  data={MINUTES}
                  keyExtractor={String}
                  renderItem={renderMinute}
                  getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
                  showsVerticalScrollIndicator={false}
                  style={{ height: ITEM_H * 5 }}
                  initialScrollIndex={Math.max(0, selM - 2)}
                  onScrollToIndexFailed={() => {}}
                />
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={tp.actions}>
            <TouchableOpacity
              onPress={onClose}
              style={[tp.cancelBtn, { borderColor: theme.border }]}
            >
              <Text style={[tp.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onSelect(selH, selM); onClose(); }}
              style={[tp.confirmBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={tp.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
};

const tp = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl,
  },
  modal: {
    width: '100%', maxWidth: 300,
    borderRadius: RADIUS.xl, borderWidth: 1,
    padding: SPACING.lg,
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  title: { fontSize: FONT_SIZES.lg, fontWeight: '700', textAlign: 'center', marginBottom: SPACING.md },
  preview: {
    alignSelf: 'center', borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  previewText: { fontSize: FONT_SIZES['2xl'], fontWeight: '800', letterSpacing: 2 },
  columns:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: SPACING.sm },
  columnWrap: { alignItems: 'center', gap: SPACING.xs },
  colLabel:   { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  column: {
    borderWidth: 1.5, borderRadius: RADIUS.md,
    overflow: 'hidden', width: 72,
  },
  item: {
    height: 44, alignItems: 'center',
    justifyContent: 'center', borderRadius: RADIUS.sm,
  },
  itemText:   { fontSize: FONT_SIZES.base },
  colon: { fontSize: FONT_SIZES['2xl'], fontWeight: '700', marginTop: 30, paddingHorizontal: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  cancelBtn: {
    flex: 1, paddingVertical: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelText:  { fontSize: FONT_SIZES.base, fontWeight: '600' },
  confirmBtn: {
    flex: 1, paddingVertical: SPACING.md,
    borderRadius: RADIUS.md, alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: FONT_SIZES.base, fontWeight: '700' },
});

// ═════════════════════════════════════════════════════════════════════════════
// DATE + TIME SELECTOR ROW  (trigger buttons)
// ═════════════════════════════════════════════════════════════════════════════
const DateTimeSelector = ({ label, icon, date, hour, minute, onDatePick, onTimePick, theme }) => (
  <View style={dts.wrapper}>
    <View style={dts.labelRow}>
      <Ionicons name={icon} size={13} color={theme.textMuted} />
      <Text style={[dts.label, { color: theme.textMuted }]}>{label}</Text>
    </View>
    <View style={dts.btnRow}>
      {/* Calendar trigger */}
      <TouchableOpacity
        onPress={onDatePick}
        style={[dts.btn, dts.dateBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
      >
        <Ionicons name="calendar-outline" size={15} color={theme.primary} />
        <Text style={[dts.btnText, { color: theme.text }]}>{formatDisplay(date)}</Text>
      </TouchableOpacity>

      {/* Time trigger */}
      <TouchableOpacity
        onPress={onTimePick}
        style={[dts.btn, dts.timeBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
      >
        <Ionicons name="time-outline" size={15} color={theme.primary} />
        <Text style={[dts.btnText, { color: theme.text }]}>{formatTimeDisplay(hour, minute)}</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const dts = StyleSheet.create({
  wrapper:  { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.xs },
  label:    { fontSize: FONT_SIZES.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  btnRow:   { flexDirection: 'row', gap: SPACING.xs },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1.5, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
  },
  dateBtn:  { flex: 1.8 },
  timeBtn:  { flex: 1 },
  btnText:  { fontSize: FONT_SIZES.sm, fontWeight: '600' },
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
const TemperatureChartScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { user }  = useAuth();

  // Default range: 7 days ago → now
  const initStart = daysAgo(7);
  const initEnd   = new Date();

  const [devices,        setDevices]        = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [readings,       setReadings]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeMetric,   setActiveMetric]   = useState('temperature');
  const [dateError,      setDateError]      = useState('');

  // Start date/time
  const [startDate, setStartDate] = useState(initStart);
  const [startHour, setStartHour] = useState(initStart.getHours());
  const [startMin,  setStartMin]  = useState(0);

  // End date/time
  const [endDate, setEndDate] = useState(initEnd);
  const [endHour, setEndHour] = useState(initEnd.getHours());
  const [endMin,  setEndMin]  = useState(initEnd.getMinutes());

  // Modal visibility
  const [showCalStart, setShowCalStart] = useState(false);
  const [showCalEnd,   setShowCalEnd]   = useState(false);
  const [showTimeStart,setShowTimeStart]= useState(false);
  const [showTimeEnd,  setShowTimeEnd]  = useState(false);

  // ── Build Date objects from parts ──────────────────────────────────────────
  const buildStart = () => {
    const d = new Date(startDate);
    d.setHours(startHour, startMin, 0, 0);
    return d;
  };
  const buildEnd = () => {
    const d = new Date(endDate);
    d.setHours(endHour, endMin, 59, 999);
    return d;
  };

  // ── Fetch devices ──────────────────────────────────────────────────────────
  const loadDevices = useCallback(async () => {
    if (USE_MOCK) {
      setDevices(MOCK_DEVICES);
      setSelectedDevice(prev => prev ?? MOCK_DEVICES[0]);
      return;
    }
    const { data } = await getUserDevices(user.id);
    if (data?.length) {
      setDevices(data);
      setSelectedDevice(prev => {
        if (prev && data.find(d => d.id === prev.id)) return prev;
        return data[0];
      });
    } else {
      setDevices([]);
      setSelectedDevice(null);
    }
  }, [user]);

  // Reload devices every time this tab is focused
  useEffect(() => {
    loadDevices();
    const unsub = navigation?.addListener('focus', loadDevices);
    return unsub;
  }, [loadDevices]);

  // ── Fetch history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!selectedDevice) return;
    setDateError('');

    const start = buildStart();
    const end   = buildEnd();

    if (start >= end) {
      setDateError('Start must be before end date/time.');
      return;
    }

    setLoading(true);
    try {
      if (USE_MOCK) {
        const diffDays = Math.ceil((end - start) / 86400000);
        const all = generateMockHistory(selectedDevice.id, Math.max(diffDays, 1));
        setReadings(all.filter(r => new Date(r.created_at) >= start && new Date(r.created_at) <= end));
        return;
      }
      const { data } = await getSensorHistory(selectedDevice.id, start, end);
      setReadings(data || []);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, startDate, startHour, startMin, endDate, endHour, endMin]);

  // Fetch when device changes
  useEffect(() => { fetchHistory(); }, [selectedDevice]);

  // ── Presets ────────────────────────────────────────────────────────────────
  const applyPreset = (days) => {
    const s = daysAgo(days);
    const e = new Date();
    setStartDate(s); setStartHour(s.getHours()); setStartMin(0);
    setEndDate(e);   setEndHour(e.getHours());   setEndMin(e.getMinutes());
  };

  const PRESETS = [
    { label: '24h', days: 1 },
    { label: '3d',  days: 3 },
    { label: '7d',  days: 7 },
    { label: '30d', days: 30 },
  ];

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = (() => {
    if (!readings.length) return null;
    const intervalMinutes = 15;
    const startTime = new Date(readings[0].created_at);
    const endTime = new Date(readings[readings.length - 1].created_at);
    const totalMinutes = (endTime - startTime) / 60000;
    const numPoints = Math.floor(totalMinutes / intervalMinutes) + 1;
    const step = Math.max(1, Math.floor(readings.length / numPoints));
    const sampled = readings.filter((_, i) => i % step === 0);
    
    const data = sampled.map(r => ({
      x: new Date(r.created_at),
      y: Number(r[activeMetric])
    }));
    
    const minY = Math.min(...data.map(d => d.y));
    const maxY = Math.max(...data.map(d => d.y));
    
    return { data, minY, maxY };
  })();

  // ── Stats ──────────────────────────────────────────────────────────────────
  const values    = readings.map(r => Number(r[activeMetric]));
  const minVal    = values.length ? Math.min(...values).toFixed(1) : '--';
  const maxVal    = values.length ? Math.max(...values).toFixed(1) : '--';
  const avgVal    = values.length ? (values.reduce((s,v)=>s+v,0)/values.length).toFixed(1) : '--';
  const unitLabel = activeMetric === 'temperature' ? '°C' : '%';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
    >
      <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

        <DeviceSelector devices={devices} selectedDevice={selectedDevice} onSelect={setSelectedDevice} />

        {/* ── Metric toggle ── */}
        <View style={styles.metricRow}>
          {[
            { key: 'temperature', label: 'Temperature', icon: 'thermometer-outline', activeIcon: 'thermometer' },
            { key: 'humidity',    label: 'Humidity',    icon: 'water-outline',        activeIcon: 'water'       },
          ].map((m) => {
            const active = activeMetric === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setActiveMetric(m.key)}
                style={[styles.metricBtn, {
                  backgroundColor: active ? theme.primary : theme.surfaceAlt,
                  borderColor:     active ? theme.primary : theme.border,
                }]}
              >
                <Ionicons name={active ? m.activeIcon : m.icon} size={18}
                  color={active ? '#fff' : theme.textSecondary} />
                <Text style={[styles.metricBtnText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Date range card ── */}
        <Card style={styles.rangeCard}>
          {/* Title + presets */}
          <View style={styles.rangeHeader}>
            <View style={styles.rangeTitleRow}>
              <Ionicons name="calendar-outline" size={16} color={theme.primary} />
              <Text style={[styles.rangeTitle, { color: theme.text }]}>Date Range</Text>
            </View>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => applyPreset(p.days)}
                  style={[styles.presetBtn, {
                    backgroundColor: theme.surfaceAlt,
                    borderColor:     theme.border,
                  }]}
                >
                  <Text style={[styles.presetText, { color: theme.textSecondary }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Start picker */}
          <DateTimeSelector
            label="Start"
            icon="play-circle-outline"
            date={startDate}
            hour={startHour}
            minute={startMin}
            onDatePick={() => setShowCalStart(true)}
            onTimePick={() => setShowTimeStart(true)}
            theme={theme}
          />

          {/* Arrow divider */}
          <View style={styles.arrowRow}>
            <View style={[styles.arrowLine, { backgroundColor: theme.divider }]} />
            <Ionicons name="arrow-down-outline" size={14} color={theme.textMuted} />
            <View style={[styles.arrowLine, { backgroundColor: theme.divider }]} />
          </View>

          {/* End picker */}
          <DateTimeSelector
            label="End"
            icon="stop-circle-outline"
            date={endDate}
            hour={endHour}
            minute={endMin}
            onDatePick={() => setShowCalEnd(true)}
            onTimePick={() => setShowTimeEnd(true)}
            theme={theme}
          />

          {dateError ? (
            <View style={[styles.errorBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
              <Ionicons name="warning-outline" size={14} color={theme.danger} />
              <Text style={[styles.errorText, { color: theme.danger }]}>{dateError}</Text>
            </View>
          ) : null}

          {/* Apply */}
          <TouchableOpacity
            onPress={fetchHistory}
            style={[styles.applyBtn, { backgroundColor: theme.primary }]}
          >
            <Ionicons name="search-outline" size={16} color="#fff" />
            <Text style={styles.applyBtnText}>Apply Range</Text>
          </TouchableOpacity>
        </Card>

        {/* ── Stats ── */}
        {readings.length > 0 && (
          <View style={styles.statsRow}>
            {[
              { label: 'Min', val: minVal, icon: 'arrow-down-outline',  color: theme.info    },
              { label: 'Avg', val: avgVal, icon: 'remove-outline',       color: theme.success },
              { label: 'Max', val: maxVal, icon: 'arrow-up-outline',     color: theme.warning },
            ].map((s) => (
              <Card key={s.label} style={styles.statCard}>
                <Ionicons name={s.icon} size={16} color={s.color} />
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.label}</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{s.val}{unitLabel}</Text>
              </Card>
            ))}
          </View>
        )}

        {/* ── Chart ── */}
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Ionicons
              name={activeMetric === 'temperature' ? 'thermometer' : 'water'}
              size={18} color={theme.primary}
            />
            <Text style={[styles.chartTitle, { color: theme.text }]}>
              {activeMetric === 'temperature' ? 'Temperature' : 'Humidity'} History
            </Text>
          </View>
          <Text style={[styles.chartSubtitle, { color: theme.textMuted }]}>
            {formatDisplay(startDate)} {formatTimeDisplay(startHour, startMin)}
            {' → '}
            {formatDisplay(endDate)} {formatTimeDisplay(endHour, endMin)}
          </Text>

          {loading ? (
            <View style={styles.placeholderWrap}>
              <Ionicons name="hourglass-outline" size={32} color={theme.textMuted} />
              <Text style={[styles.placeholder, { color: theme.textMuted }]}>Loading...</Text>
            </View>
          ) : chartData ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ marginHorizontal: -SPACING.base }}>
                <LineChart
                  data={{
                    labels: chartData.data.map((point, index) => {
                      // Show time label every few points to avoid overcrowding
                      if (index % Math.max(1, Math.floor(chartData.data.length / 6)) === 0) {
                        const d = new Date(point.x);
                        return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
                      }
                      return '';
                    }),
                    datasets: [{
                      data: chartData.data.map(point => point.y),
                      color: () => theme.primary,
                      strokeWidth: 2,
                    }],
                  }}
                  width={Math.max(CHART_WIDTH, chartData.data.length * 60)} // Ensure minimum width for scrolling
                  height={220}
                  chartConfig={{
                    backgroundColor: theme.surfaceAlt,
                    backgroundGradientFrom: theme.surfaceAlt,
                    backgroundGradientTo: theme.surfaceAlt,
                    decimalPlaces: 1,
                    color: () => theme.primary,
                    labelColor: () => theme.text,
                    style: {
                      borderRadius: RADIUS.md,
                    },
                    propsForLabels: {
                      fontSize: 10,
                    },
                    propsForDots: {
                      r: '3',
                      strokeWidth: '2',
                      stroke: theme.primary,
                    },
                    // Grid configuration
                    gridColor: theme.border,
                    gridStrokeWidth: 1,
                    showGridLines: true,
                  }}
                  style={{
                    marginVertical: 8,
                    borderRadius: RADIUS.md,
                  }}
                  withDots={true}
                  withInnerLines={true}
                  withOuterLines={true}
                  withVerticalLabels={true}
                  withHorizontalLabels={true}
                  yAxisSuffix={unitLabel}
                  yAxisInterval={1}
                  formatYLabel={(y) => `${parseFloat(y).toFixed(1)}${unitLabel}`}
                  fromZero={false}
                  segments={5}
                />
              </ScrollView>
              {/* Chart details */}
              <View style={styles.chartDetails}>
                <Text style={[styles.chartDetailText, { color: theme.textMuted }]}>
                  Time Range: {formatDisplay(startDate)} {formatTimeDisplay(startHour, startMin)} → {formatDisplay(endDate)} {formatTimeDisplay(endHour, endMin)}
                </Text>
                <Text style={[styles.chartDetailText, { color: theme.textMuted }]}>
                  Duration: {(() => {
                    const diffMs = buildEnd() - buildStart();
                    const hours = Math.floor(diffMs / 3600000);
                    const minutes = Math.floor((diffMs % 3600000) / 60000);
                    return `${hours}h ${minutes}m`;
                  })()}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.placeholderWrap}>
              <Ionicons name="bar-chart-outline" size={32} color={theme.textMuted} />
              <Text style={[styles.placeholder, { color: theme.textMuted }]}>
                No data for this range.
              </Text>
            </View>
          )}
        </Card>

        {readings.length > 0 && (
          <Text style={[styles.footer, { color: theme.textMuted }]}>
            {readings.length} readings in selected range
          </Text>
        )}
      </View>

      {/* ── Modals ── */}
      <CalendarPicker
        visible={showCalStart}
        value={startDate}
        onSelect={setStartDate}
        onClose={() => setShowCalStart(false)}
        theme={theme}
      />
      <CalendarPicker
        visible={showCalEnd}
        value={endDate}
        onSelect={setEndDate}
        onClose={() => setShowCalEnd(false)}
        theme={theme}
      />
      <TimePicker
        visible={showTimeStart}
        hour={startHour}
        minute={startMin}
        onSelect={(h, m) => { setStartHour(h); setStartMin(m); }}
        onClose={() => setShowTimeStart(false)}
        theme={theme}
      />
      <TimePicker
        visible={showTimeEnd}
        hour={endHour}
        minute={endMin}
        onSelect={(h, m) => { setEndHour(h); setEndMin(m); }}
        onClose={() => setShowTimeEnd(false)}
        theme={theme}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: SPACING.base, paddingTop: SPACING.lg, paddingBottom: 80 },

  metricRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  metricBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md, borderWidth: 1.5,
  },
  metricBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },

  rangeCard:    { marginBottom: SPACING.md, gap: SPACING.md },
  rangeHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rangeTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  rangeTitle:   { fontSize: FONT_SIZES.base, fontWeight: '700' },
  presetRow:    { flexDirection: 'row', gap: SPACING.xs },
  presetBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.md, borderWidth: 1.5,
  },
  presetText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  arrowRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.xs },
  arrowLine: { flex: 1, height: 1 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm,
  },
  errorText: { fontSize: FONT_SIZES.xs, fontWeight: '600', flex: 1 },

  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  applyBtnText: { color: '#fff', fontSize: FONT_SIZES.base, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statCard: { flex: 1, padding: SPACING.md, alignItems: 'center', gap: SPACING.xs },
  statLabel: { fontSize: FONT_SIZES.xs, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  statValue: { fontSize: FONT_SIZES.lg, fontWeight: '800' },

  chartCard:       { padding: SPACING.base },
  chartHeader:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
  chartTitle:      { fontSize: FONT_SIZES.base, fontWeight: '700' },
  chartSubtitle:   { fontSize: FONT_SIZES.xs, marginBottom: SPACING.md },
  chartDetails:    { marginTop: SPACING.sm, gap: SPACING.xs },
  chartDetailText: { fontSize: FONT_SIZES.xs },
  placeholderWrap: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  placeholder:     { fontSize: FONT_SIZES.sm },
  footer:          { fontSize: FONT_SIZES.xs, textAlign: 'center', marginTop: SPACING.md },
});

export default TemperatureChartScreen;
