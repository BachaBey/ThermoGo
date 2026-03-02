import 'react-native-url-polyfill/auto';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './styles/ThemeContext';
import { AuthProvider } from './services/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import InstallPrompt from './components/InstallPrompt';

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
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
