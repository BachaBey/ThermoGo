import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { signIn } from '../services/supabase';
import { useTheme } from '../styles/ThemeContext';
import { Button, Input } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const SignInScreen = ({ navigation }) => {
  const { theme, isDark, toggleTheme } = useTheme();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSignIn = async () => {
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }

    setLoading(true);
    const { error: authError } = await signIn(email, password);
    setLoading(false);

    if (authError) setError(authError.message);
    // On success, AuthContext fires onAuthStateChange → AppNavigator renders Main tabs
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
          <Text style={{ fontSize: 22 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.logo}>🌡️</Text>
          <Text style={[styles.appName, { color: theme.primary }]}>ThermoGo</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            Real-time temperature monitoring
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Sign in to your account</Text>

          {error ? (
            <View style={[styles.alertBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
              <Text style={[styles.alertText, { color: theme.danger }]}>⚠️ {error}</Text>
            </View>
          ) : null}

          <Input label="Email" value={email} onChangeText={setEmail}
            placeholder="you@example.com" keyboardType="email-address" />
          <Input label="Password" value={password} onChangeText={setPassword}
            placeholder="••••••••" secureTextEntry />

          <Button title="Sign In" onPress={handleSignIn} loading={loading}
            style={{ marginTop: SPACING.xs }} />

          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.switchLink}>
            <Text style={[styles.switchText, { color: theme.textSecondary }]}>
              Don't have an account?{' '}
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: SPACING.xl, alignItems: 'center', justifyContent: 'center', paddingTop: SPACING['3xl'] },
  themeToggle: { position: 'absolute', top: SPACING.xl, right: SPACING.xl, padding: SPACING.sm },
  hero: { alignItems: 'center', marginBottom: SPACING['2xl'] },
  logo: { fontSize: 56, marginBottom: SPACING.sm },
  appName: { fontSize: FONT_SIZES['3xl'], fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: FONT_SIZES.base, marginTop: SPACING.xs },
  card: {
    width: '100%', maxWidth: CONTENT_MAX_WIDTH, borderRadius: RADIUS.xl, borderWidth: 1,
    padding: SPACING.xl, shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  title: { fontSize: FONT_SIZES['2xl'], fontWeight: '700', letterSpacing: -0.5, marginBottom: SPACING.xs },
  subtitle: { fontSize: FONT_SIZES.base, marginBottom: SPACING.xl },
  alertBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.base },
  alertText: { fontSize: FONT_SIZES.sm, fontWeight: '500' },
  switchLink: { alignItems: 'center', marginTop: SPACING.lg },
  switchText: { fontSize: FONT_SIZES.sm },
});

export default SignInScreen;
