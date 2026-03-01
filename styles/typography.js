import { Platform, Dimensions } from 'react-native';

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const isWeb = Platform.OS === 'web';
export const isTablet = SCREEN_WIDTH >= 768;

export const FONTS = {
  regular: Platform.select({ web: "'DM Sans', sans-serif", default: undefined }),
  medium: Platform.select({ web: "'DM Sans', sans-serif", default: undefined }),
  bold: Platform.select({ web: "'DM Sans', sans-serif", default: undefined }),
  mono: Platform.select({ web: "'DM Mono', monospace", default: 'monospace' }),
};

export const FONT_SIZES = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 30,
  '3xl': 36,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
};

export const CONTENT_MAX_WIDTH = 520;

export const containerStyle = {
  flex: 1,
  alignSelf: 'center',
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
};
