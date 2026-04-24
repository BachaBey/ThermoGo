import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity, Alert,
} from 'react-native';
import { useTheme } from '../styles/ThemeContext';
import { useAuth } from '../services/AuthContext';
import { updateProfile, signOut } from '../services/supabase';
import { Button, Input, Card, Divider } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const ProfileScreen = ({ navigation }) => {
  const { theme }                        = useTheme();
  const { user, profile, refreshProfile } = useAuth();

  const [editing,   setEditing]   = useState(false);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName,  setLastName]  = useState(profile?.last_name  || '');
  const [phone,     setPhone]     = useState(profile?.phone      || '');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  // Sync fields whenever the profile loads or refreshes
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name   || '');
      setPhone(profile.phone          || '');
    }
  }, [profile]);

  const handleSave = async () => {
  setError(''); setSuccess('');
  if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
    setError('All fields are required.');
    return;
  }
  setLoading(true);
  const { error: updateError } = await updateProfile(user.id, {
    first_name: firstName.trim(),
    last_name:  lastName.trim(),
    phone:      phone.trim(),
  });
  setLoading(false);
  if (updateError) {
    setError(updateError.message);
  } else {
    setSuccess('Profile updated successfully.');
    setEditing(false);
    refreshProfile();
  }
};

// Auto-clear messages after 3 seconds
useEffect(() => {
  if (!success && !error) return;
  const timer = setTimeout(() => {
    setSuccess('');
    setError('');
  }, 3000);
  return () => clearTimeout(timer);
}, [success, error]);

// Clear messages immediately when user leaves the screen
useEffect(() => {
  const unsub = navigation?.addListener('blur', () => {
    setSuccess('');
    setError('');
  });
  return unsub;
}, [navigation]);

  const handleCancel = () => {
    setFirstName(profile?.first_name || '');
    setLastName(profile?.last_name   || '');
    setPhone(profile?.phone          || '');
    setError('');
    setEditing(false);
  };

  // Avatar initials
  const initials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.toUpperCase();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }}>

          {/* ── Avatar ── */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{initials || '?'}</Text>
            </View>
            <Text style={[styles.fullName, { color: theme.text }]}>
              {profile?.first_name} {profile?.last_name}
            </Text>
            <Text style={[styles.email, { color: theme.textSecondary }]}>
              {user?.email}
            </Text>
            <Text style={[styles.memberSince, { color: theme.textMuted }]}>
              Member since {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : '—'}
            </Text>
          </View>

          {/* ── Alerts ── */}
          {error ? (
            <View style={[styles.alertBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
              <Text style={[styles.alertText, { color: theme.danger }]}>⚠️ {error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={[styles.alertBox, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
              <Text style={[styles.alertText, { color: theme.success }]}>✅ {success}</Text>
            </View>
          ) : null}

          {/* ── Profile card ── */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Personal Info</Text>
              {!editing && (
                <TouchableOpacity
                  onPress={() => { setEditing(true); setSuccess(''); }}
                  style={[styles.editBtn, { borderColor: theme.primary }]}
                >
                  <Text style={[styles.editBtnText, { color: theme.primary }]}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            <Divider />

            {editing ? (
              <>
                <View style={styles.nameRow}>
                  <View style={{ flex: 1 }}>
                    <Input label="First Name" value={firstName}
                      onChangeText={setFirstName} placeholder="Alex"
                      autoCapitalize="words" />
                  </View>
                  <View style={{ width: SPACING.sm }} />
                  <View style={{ flex: 1 }}>
                    <Input label="Last Name" value={lastName}
                      onChangeText={setLastName} placeholder="Martin"
                      autoCapitalize="words" />
                  </View>
                </View>
                <Input label="Phone" value={phone}
                  onChangeText={setPhone} placeholder="+216 55 000 000"
                  keyboardType="phone-pad" autoCapitalize="none" />

                <View style={styles.actionRow}>
                  <Button title="Cancel" variant="outline" onPress={handleCancel}
                    style={{ flex: 1 }} />
                  <View style={{ width: SPACING.sm }} />
                  <Button title="Save" onPress={handleSave} loading={loading}
                    style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <>
                {[
                  ['First Name', profile?.first_name],
                  ['Last Name',  profile?.last_name],
                  ['Phone',      profile?.phone],
                  ['Email',      user?.email],
                ].map(([label, value], i, arr) => (
                  <View key={label}>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{value || '—'}</Text>
                    </View>
                    {i < arr.length - 1 && (
                      <View style={[styles.innerDivider, { backgroundColor: theme.divider }]} />
                    )}
                  </View>
                ))}
              </>
            )}
          </Card>

          {/* ── Sign out ── */}
          <Button
            title="Sign Out"
            variant="danger"
            onPress={async () => {
              const { error: signOutError } = await signOut();
              if (signOutError) Alert.alert('Sign Out Failed', 'Could not sign out. Please try again.');
            }}
            style={{ marginTop: SPACING.lg }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { padding: SPACING.base, paddingTop: SPACING.lg, paddingBottom: 80 },
  avatarSection: { alignItems: 'center', marginBottom: SPACING.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarText: { color: '#fff', fontSize: FONT_SIZES['2xl'], fontWeight: '800' },
  fullName: { fontSize: FONT_SIZES.xl, fontWeight: '700', letterSpacing: -0.3 },
  email: { fontSize: FONT_SIZES.sm, marginTop: SPACING.xs },
  memberSince: { fontSize: FONT_SIZES.xs, marginTop: SPACING.xs },
  alertBox: {
    borderWidth: 1, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.base,
  },
  alertText: { fontSize: FONT_SIZES.sm, fontWeight: '500' },
  card: { marginBottom: SPACING.base },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700' },
  editBtn: {
    borderWidth: 1.5, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  editBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  nameRow: { flexDirection: 'row' },
  actionRow: { flexDirection: 'row', marginTop: SPACING.xs },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: SPACING.sm,
  },
  infoLabel: { fontSize: FONT_SIZES.sm, fontWeight: '500' },
  infoValue: { fontSize: FONT_SIZES.sm, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: SPACING.md },
  innerDivider: { height: 1 },
});

export default ProfileScreen;
