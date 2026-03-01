import React, { createContext, useContext, useState } from 'react';

export const lightTheme = {
  mode: 'light',
  // Backgrounds
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F5',
  // Brand
  primary: '#006C95',
  primaryLight: '#E8F4FA',
  // Text
  text: '#0D1B2A',
  textSecondary: '#5A6A7A',
  textMuted: '#9AA5B1',
  // Borders & dividers
  border: '#DDE3EA',
  divider: '#EEF1F5',
  // Status
  success: '#0D8050',
  successBg: '#E8F5EE',
  warning: '#C87619',
  warningBg: '#FEF3E2',
  danger: '#C0392B',
  dangerBg: '#FDECEA',
  info: '#006C95',
  infoBg: '#E8F4FA',
  // Navbar
  navBg: '#FFFFFF',
  navBorder: '#DDE3EA',
  // Card shadow
  shadowColor: '#000',
  shadowOpacity: 0.06,
};

export const darkTheme = {
  mode: 'dark',
  background: '#0D1117',
  surface: '#161B22',
  surfaceAlt: '#1C2333',
  primary: '#58B9E0',
  primaryLight: '#0D2535',
  text: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  border: '#30363D',
  divider: '#21262D',
  success: '#3FB950',
  successBg: '#0D2818',
  warning: '#E3B341',
  warningBg: '#2A1F00',
  danger: '#F85149',
  dangerBg: '#2D1117',
  info: '#58B9E0',
  infoBg: '#0D2535',
  navBg: '#161B22',
  navBorder: '#30363D',
  shadowColor: '#000',
  shadowOpacity: 0.3,
};

const ThemeContext = createContext({
  theme: lightTheme,
  isDark: false,
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
