import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../styles/ThemeContext';
import { FONT_SIZES, SPACING, RADIUS } from '../styles/typography';

// ─── Button ──────────────────────────────────────────────────────────────────

export const Button = ({
  title,
  onPress,
  loading = false,
  variant = 'primary', // 'primary' | 'outline' | 'ghost' | 'danger'
  size = 'md',
  disabled = false,
  style,
}) => {
  const { theme } = useTheme();

  const bgMap = {
    primary: theme.primary,
    outline: 'transparent',
    ghost: 'transparent',
    danger: theme.danger,
  };

  const textColorMap = {
    primary: '#FFFFFF',
    outline: theme.primary,
    ghost: theme.textSecondary,
    danger: '#FFFFFF',
  };

  const borderMap = {
    primary: 'transparent',
    outline: theme.primary,
    ghost: 'transparent',
    danger: 'transparent',
  };

  const paddingMap = { sm: SPACING.sm, md: SPACING.md, lg: SPACING.lg };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.btn,
        {
          backgroundColor: bgMap[variant],
          borderColor: borderMap[variant],
          borderWidth: variant === 'outline' ? 1.5 : 0,
          paddingVertical: paddingMap[size],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColorMap[variant]} size="small" />
      ) : (
        <Text style={[styles.btnText, { color: textColorMap[variant] }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Input ───────────────────────────────────────────────────────────────────

export const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  error,
  style,
  inputStyle,
  noBorder = false,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.inputWrapper, style]}>
      {label && <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[
          styles.input,
          {
            backgroundColor: theme.surfaceAlt,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
            ...(noBorder && { borderWidth: 0, backgroundColor: 'transparent' }),
          },
          inputStyle,
        ]}
      />
      {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────

export const Card = ({ children, style }) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.shadowOpacity,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

// ─── Badge ────────────────────────────────────────────────────────────────────

export const Badge = ({ label, type = 'info' }) => {
  const { theme } = useTheme();

  const bgMap = {
    info: theme.infoBg,
    success: theme.successBg,
    warning: theme.warningBg,
    danger: theme.dangerBg,
  };
  const textMap = {
    info: theme.info,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
  };

  return (
    <View style={[styles.badge, { backgroundColor: bgMap[type] }]}>
      <Text style={[styles.badgeText, { color: textMap[type] }]}>{label}</Text>
    </View>
  );
};

// ─── Divider ──────────────────────────────────────────────────────────────────

export const Divider = () => {
  const { theme } = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.divider }]} />;
};

const styles = StyleSheet.create({
  btn: {
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  inputWrapper: {
    marginBottom: SPACING.base,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.base,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.base,
  },
});
