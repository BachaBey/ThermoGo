import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { FONT_SIZES, SPACING, RADIUS } from '../styles/typography';
import UpdateWiFiModal from './UpdateWiFiModal';

const DeviceSelector = ({ devices, selectedDevice, onSelect }) => {
  const { theme }    = useTheme();
  const [open, setOpen] = useState(false);
  const [wifiUpdateDevice, setWifiUpdateDevice] = useState(null);

  if (!devices || devices.length === 0) return null;

  // Display name: prefer device.name, fallback to device.device_id
  const displayName = (d) => d?.name || d?.device_id || 'Unknown';

  return (
    <>
      {/* ── Trigger pill ─────────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        style={[
          styles.trigger,
          { backgroundColor: theme.primaryLight, borderColor: theme.primary },
        ]}
      >
        {/* Left icon */}
        <View style={[styles.triggerIcon, { backgroundColor: theme.primary }]}>
          <Ionicons name="hardware-chip" size={18} color="#fff" />
        </View>

        {/* Text block */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.triggerLabel, { color: theme.textMuted }]}>
            Active Device
          </Text>
          <Text style={[styles.triggerName, { color: theme.primary }]} numberOfLines={1}>
            {selectedDevice?.name || selectedDevice?.device_id || 'Select a device'}
          </Text>
          {selectedDevice?.name && (
            <Text style={[styles.triggerId, { color: theme.textMuted }]}>
              {selectedDevice.device_id}
            </Text>
          )}
        </View>

        {/* Chevron */}
        <Ionicons name="chevron-down" size={18} color={theme.primary} />
      </TouchableOpacity>

      {/* ── Device list modal ─────────────────────────────────────────────── */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Ionicons name="hardware-chip" size={20} color={theme.primary} />
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Select Device</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: theme.divider }]} />

            {/* List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 360 }}
              bounces={false}
            >
              {devices.map((device, index) => {
                const isSelected = selectedDevice?.id === device.id;
                const name       = device.name || device.device_id;
                const hasName    = !!device.name;

                return (
                  <View key={device.id}>
                    <TouchableOpacity
                      onPress={() => { onSelect(device); setOpen(false); }}
                      activeOpacity={0.7}
                      style={[
                        styles.deviceRow,
                        {
                          backgroundColor: isSelected ? theme.primaryLight : 'transparent',
                          borderColor:     isSelected ? theme.primary      : 'transparent',
                        },
                      ]}
                    >
                      {/* Icon circle */}
                      <View style={[
                        styles.deviceIcon,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceAlt,
                          borderColor:     isSelected ? theme.primary : theme.border,
                        },
                      ]}>
                        <Ionicons
                          name="hardware-chip-outline"
                          size={18}
                          color={isSelected ? '#fff' : theme.textSecondary}
                        />
                      </View>

                      {/* Name + ID */}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.deviceName,
                            { color: isSelected ? theme.primary : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        {hasName && (
                          <Text style={[styles.deviceId, { color: theme.textMuted }]}>
                            {device.device_id}
                          </Text>
                        )}
                        {/* Target temp chip if available */}
                        {device.target_temp != null && (
                          <View style={styles.chipRow}>
                            <View style={[styles.chip, { backgroundColor: isSelected ? theme.primary + '20' : theme.surfaceAlt }]}>
                              <Ionicons name="flag-outline" size={10} color={isSelected ? theme.primary : theme.textMuted} />
                              <Text style={[styles.chipText, { color: isSelected ? theme.primary : theme.textMuted }]}>
                                Target {device.target_temp}°C
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Checkmark or chevron on right side */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation?.();
                            setWifiUpdateDevice(device);
                          }}
                          activeOpacity={0.6}
                          style={[
                            styles.wifiBtn,
                            { backgroundColor: theme.primaryLight, borderColor: theme.primary }
                          ]}
                        >
                          <Ionicons name="wifi-outline" size={14} color={theme.primary} />
                        </TouchableOpacity>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                        ) : (
                          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Row divider */}
                    {index < devices.length - 1 && (
                      <View style={[styles.rowDivider, { backgroundColor: theme.divider }]} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Update WiFi Modal */}
      {wifiUpdateDevice && (
        <UpdateWiFiModal
          visible={!!wifiUpdateDevice}
          device={wifiUpdateDevice}
          theme={theme}
          onClose={() => setWifiUpdateDevice(null)}
          onSuccess={() => {
            // Modal will close and update device
            setWifiUpdateDevice(null);
          }}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  // ── Trigger ──────────────────────────────────────────────────────────────
  trigger: {
    flexDirection:  'row',
    alignItems:     'center',
    borderWidth:    1.5,
    borderRadius:   RADIUS.lg,
    padding:        SPACING.md,
    marginBottom:   SPACING.lg,
    gap:            SPACING.sm,
  },
  triggerIcon: {
    width:          38,
    height:         38,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  triggerLabel: {
    fontSize:      FONT_SIZES.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight:    '600',
  },
  triggerName: {
    fontSize:   FONT_SIZES.base,
    fontWeight: '700',
    marginTop:  1,
  },
  triggerId: {
    fontSize:  FONT_SIZES.xs,
    marginTop: 1,
  },

  // ── Modal overlay ─────────────────────────────────────────────────────────
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'center',
    alignItems:      'center',
    padding:         SPACING.xl,
  },
  sheet: {
    width:        '100%',
    maxWidth:     440,
    borderRadius: RADIUS.xl,
    borderWidth:  1,
    padding:      SPACING.lg,
    shadowColor:  '#000',
    shadowOpacity:0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation:    12,
  },

  // ── Sheet header ──────────────────────────────────────────────────────────
  sheetHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.sm,
    marginBottom:   SPACING.md,
  },
  sheetTitle: {
    fontSize:   FONT_SIZES.lg,
    fontWeight: '700',
    flex:       1,
  },
  closeBtn: { padding: SPACING.xs },
  divider:  { height: 1, marginBottom: SPACING.sm },

  // ── Device row ────────────────────────────────────────────────────────────
  deviceRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.md,
    paddingVertical:SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius:   RADIUS.md,
    borderWidth:    1.5,
    marginVertical: 2,
  },
  deviceIcon: {
    width:          42,
    height:         42,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1.5,
  },
  deviceName: {
    fontSize:   FONT_SIZES.base,
    fontWeight: '700',
  },
  deviceId: {
    fontSize:  FONT_SIZES.xs,
    marginTop: 2,
    fontWeight:'500',
  },
  chipRow: { flexDirection: 'row', marginTop: SPACING.xs },
  chip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            3,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius:   RADIUS.sm,
  },
  chipText: { fontSize: 10, fontWeight: '600' },

  wifiBtn: {
    width:          32,
    height:         32,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1.5,
  },

  rowDivider: { height: 1, marginHorizontal: SPACING.xs },
});

export default DeviceSelector;
