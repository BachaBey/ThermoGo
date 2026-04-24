import 'react-native-url-polyfill/auto';
import React from 'react';
import { Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './styles/ThemeContext';
import { AuthProvider } from './services/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import InstallPrompt from './components/InstallPrompt';

// Prevent the OS accessibility font-size setting from breaking layouts
Text.defaultProps = { ...(Text.defaultProps || {}), allowFontScaling: false };
TextInput.defaultProps = { ...(TextInput.defaultProps || {}), allowFontScaling: false };

// Wrapper so InstallPrompt can access theme
const AppContent = () => {
  const { theme } = useTheme();
  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
      <InstallPrompt
        appName="ThermoGo"
        theme={theme}
      />
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
