import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { signUp } from '../services/supabase';
import { useTheme } from '../styles/ThemeContext';
import { Button, Input } from '../components/UI';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const SignUpScreen = ({ navigation }) => {
  const { theme, isDark, toggleTheme } = useTheme();

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  const handleSignUp = async () => {
  setError(''); 
  setSuccess('');
  
  // Validation
  if (!firstName || !lastName || !phone || !email || !password || !confirm) {
    setError('Please fill in all fields.');
    return;
  }
  if (password !== confirm) {
    setError('Passwords do not match.');
    return;
  }
  if (password.length < 6) {
    setError('Password must be at least 6 characters.');
    return;
  }

  setLoading(true);

  // This is the call that sends data to Supabase
  const { error: signUpError } = await signUp({
    email,
    password,
    firstName,
    lastName,
    phone,
  });

  setLoading(false);

  if (signUpError) {
    setError(signUpError.message);
  } else {
    setSuccess(true);
  }
};


  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme toggle */}
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
          <Text style={{ fontSize: 22 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.logo}>🌡️</Text>
          <Text style={[styles.appName, { color: theme.primary }]}>ThermoGo</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            Real-time temperature monitoring
          </Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Fill in your details to get started
          </Text>

          {success ? (
            <View style={[styles.alertBox, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
              <Text style={[styles.alertText, { color: theme.success }]}>
                ✅ Account created! Check your email to confirm, then sign in.
              </Text>
            </View>
          ) : (
            <>
              {error ? (
                <View style={[styles.alertBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
                  <Text style={[styles.alertText, { color: theme.danger }]}>⚠️ {error}</Text>
                </View>
              ) : null}

              {/* Row: First + Last name */}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="First Name"
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Alex"
                    autoCapitalize="words"
                  />
                </View>
                <View style={{ width: SPACING.sm }} />
                <View style={{ flex: 1 }}>
                  <Input
                    label="Last Name"
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Martin"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <Input
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+216 55 000 000"
                keyboardType="phone-pad"
                autoCapitalize="none"
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
              />
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                secureTextEntry
              />
              <Input
                label="Confirm Password"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat password"
                secureTextEntry
              />

              <Button
                title="Create Account"
                onPress={handleSignUp}
                loading={loading}
                style={{ marginTop: SPACING.xs }}
              />
            </>
          )}

          <TouchableOpacity
            onPress={() => navigation.navigate('SignIn')}
            style={styles.switchLink}
          >
            <Text style={[styles.switchText, { color: theme.textSecondary }]}>
              Already have an account?{' '}
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING['3xl'],
  },
  themeToggle: { position: 'absolute', top: SPACING.xl, right: SPACING.xl, padding: SPACING.sm },
  hero: { alignItems: 'center', marginBottom: SPACING['2xl'] },
  logo: { fontSize: 56, marginBottom: SPACING.sm },
  appName: { fontSize: FONT_SIZES['3xl'], fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: FONT_SIZES.base, marginTop: SPACING.xs },
  card: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.xl,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: { fontSize: FONT_SIZES['2xl'], fontWeight: '700', letterSpacing: -0.5, marginBottom: SPACING.xs },
  subtitle: { fontSize: FONT_SIZES.base, marginBottom: SPACING.lg },
  row: { flexDirection: 'row' },
  alertBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.base },
  alertText: { fontSize: FONT_SIZES.sm, fontWeight: '500', lineHeight: 20 },
  switchLink: { alignItems: 'center', marginTop: SPACING.lg },
  switchText: { fontSize: FONT_SIZES.sm },
});

export default SignUpScreen;
