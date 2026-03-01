import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useTheme } from '../styles/ThemeContext';
import { FONT_SIZES, SPACING, RADIUS } from '../styles/typography';

const DeviceSelector = ({ devices, selectedDevice, onSelect }) => {
  const { theme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  if (!devices || devices.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setModalOpen(true)}
        style={[styles.selector, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
      >
        <Text style={[styles.selectorIcon]}>📡</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.selectorLabel, { color: theme.textMuted }]}>Active Device</Text>
          <Text style={[styles.selectorValue, { color: theme.primary }]}>
            {selectedDevice?.name || 'Select a device'}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: theme.primary }]}>›</Text>
      </TouchableOpacity>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setModalOpen(false)}>
          <View style={[styles.modal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Device</Text>
            {devices.map((device) => (
              <TouchableOpacity
                key={device.id}
                onPress={() => {
                  onSelect(device);
                  setModalOpen(false);
                }}
                style={[
                  styles.deviceOption,
                  {
                    backgroundColor:
                      selectedDevice?.id === device.id ? theme.primaryLight : theme.surfaceAlt,
                    borderColor:
                      selectedDevice?.id === device.id ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 20 }}>📡</Text>
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={[styles.deviceName, { color: theme.text }]}>{device.name}</Text>
                  <Text style={[styles.deviceId, { color: theme.textMuted }]}>
                    ID: {device.device_id}
                  </Text>
                </View>
                {selectedDevice?.id === device.id && (
                  <Text style={{ color: theme.primary, fontSize: 18 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  selectorIcon: { fontSize: 20 },
  selectorLabel: { fontSize: FONT_SIZES.xs, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  selectorValue: { fontSize: FONT_SIZES.base, fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 24, fontWeight: '300' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  deviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  deviceName: { fontSize: FONT_SIZES.base, fontWeight: '600' },
  deviceId: { fontSize: FONT_SIZES.xs, marginTop: 2 },
});

export default DeviceSelector;
