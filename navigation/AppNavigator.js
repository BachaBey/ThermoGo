import React from 'react';
import {
  Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, View, Platform, Image,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator }  from '@react-navigation/native-stack';
import { createBottomTabNavigator }    from '@react-navigation/bottom-tabs';
import { Ionicons }                    from '@expo/vector-icons';

import { useAuth }  from '../services/AuthContext';
import { useTheme } from '../styles/ThemeContext';
import { FONT_SIZES, SPACING, RADIUS } from '../styles/typography';

import SignInScreen           from '../screens/SignInScreen';
import SignUpScreen           from '../screens/SignUpScreen';
import CurrentStatusScreen    from '../screens/CurrentStatusScreen';
import TemperatureChartScreen from '../screens/TemperatureChartScreen';
import NotificationsScreen    from '../screens/NotificationsScreen';
import AddDeviceScreen        from '../screens/AddDeviceScreen';
import ProfileScreen          from '../screens/ProfileScreen';
import AskAIScreen            from '../screens/AskAIScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Icon map: route name → Ionicons name (outline / filled) ─────────────────
const ICON_MAP = {
  Status:    { outline: 'stats-chart-outline',  filled: 'stats-chart'  },
  Chart:     { outline: 'analytics-outline',    filled: 'analytics'    },
  Alerts:    { outline: 'notifications-outline',filled: 'notifications' },
  Profile:   { outline: 'person-outline',       filled: 'person'       },
};

// ─── Nav bar logo (switches with theme) ──────────────────────────────────────
const NAV_LOGO_LIGHT = require('../assets/icon-nav.png');
const NAV_LOGO_DARK  = require('../assets/logo-dark.png');

const NavLogo = () => {
  const { isDark } = useTheme();
  return (
    <Image
      source={isDark ? NAV_LOGO_DARK : NAV_LOGO_LIGHT}
      style={styles.navLogo}
      resizeMode="contain"
    />
  );
};

// ─── Special "Add Device" centre button ──────────────────────────────────────
const AddDeviceTabIcon = ({ focused, color, primaryColor }) => (
  <View style={[
    styles.addBtn,
    { backgroundColor: primaryColor, shadowColor: primaryColor },
  ]}>
    <Ionicons
      name={focused ? 'add-circle' : 'add-circle-outline'}
      size={28}
      color="#ffffff"
    />
  </View>
);

// ─── Main tab navigator ───────────────────────────────────────────────────────
const MainTabs = () => {
  const { theme, isDark, toggleTheme } = useTheme();

  const headerRight = () => (
    <TouchableOpacity onPress={toggleTheme} style={styles.themeBtn}>
      <Ionicons
        name={isDark ? 'sunny-outline' : 'moon-outline'}
        size={22}
        color={theme.primary}
      />
    </TouchableOpacity>
  );

  const headerLeft = () => <NavLogo />;

  const sharedHeader = {
    headerStyle:         { backgroundColor: theme.navBg },
    headerTitleStyle:    { color: theme.navText, fontSize: FONT_SIZES.lg, fontWeight: '700', letterSpacing: -0.5 },
    headerTintColor:     theme.navText,
    headerLeft,
    headerRight,
    headerShadowVisible: true,
    headerTitle:         'ThermoGo',
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...sharedHeader,

        // ── Tab bar container ──────────────────────────────────────────────
        tabBarStyle: {
          backgroundColor:  theme.navBg,
          borderTopColor:   theme.navBorder,
          borderTopWidth:   1,
          paddingBottom:    Platform.OS === 'ios' ? 20 : 6,
          paddingTop:       6,
          height:           Platform.OS === 'ios' ? 88 : 64,
        },
        tabBarActiveTintColor:   theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize:   FONT_SIZES.xs,
          fontWeight: '600',
          marginTop:  2,
        },

        // ── Icons ─────────────────────────────────────────────────────────
        tabBarIcon: ({ focused, color }) => {
          // Special centre button for AddDevice
          if (route.name === 'AddDevice') {
            return (
              <AddDeviceTabIcon
                focused={focused}
                color={color}
                primaryColor={theme.primary}
              />
            );
          }

          const icons = ICON_MAP[route.name];
          if (!icons) return null;

          return (
            <Ionicons
              name={focused ? icons.filled : icons.outline}
              size={22}
              color={color}
            />
          );
        },
      })}
    >
      {/* Order: Status | Chart | AddDevice (centre) | Alerts | Profile */}
      <Tab.Screen
        name="Status"
        component={CurrentStatusScreen}
        options={{ tabBarLabel: 'Status' }}
      />
      <Tab.Screen
        name="Chart"
        component={TemperatureChartScreen}
        options={{ tabBarLabel: 'Chart' }}
      />
      <Tab.Screen
        name="AddDevice"
        component={AddDeviceScreen}
        options={{
          tabBarLabel: '',          // no label under the big button
          tabBarStyle: undefined,   // inherits shared style
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{ tabBarLabel: 'Alerts' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

// ─── Splash / loading screen ──────────────────────────────────────────────────
const SplashScreen = () => {
  const { theme, isDark } = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: theme.background }]}>
      <Image
        source={isDark ? NAV_LOGO_DARK : NAV_LOGO_LIGHT}
        style={styles.splashLogo}
        resizeMode="contain"
      />
      <Text style={[styles.splashTitle, { color: theme.text }]}>ThermoGo</Text>
      <Text style={[styles.splashSub, { color: theme.textSecondary }]}>
        Real-time temperature monitoring
      </Text>
      <ActivityIndicator size="large" color={theme.primary} style={styles.splashSpinner} />
    </View>
  );
};

// ─── Root navigator ───────────────────────────────────────────────────────────
const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) return <SplashScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main"  component={MainTabs}  />
            <Stack.Screen name="AskAI" component={AskAIScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
  },
  splashLogo:    { width: 96, height: 96, marginBottom: SPACING.sm },
  splashTitle:   { fontSize: FONT_SIZES['2xl'], fontWeight: '800', letterSpacing: -0.5 },
  splashSub:     { fontSize: FONT_SIZES.sm },
  splashSpinner: { marginTop: SPACING.xl },
  themeBtn: {
    marginRight: SPACING.base,
    padding:     SPACING.xs,
  },
  navLogo: {
    width:       36,
    height:      36,
    marginLeft:  SPACING.sm,
  },
  loader: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  // ── Special "Add Device" raised button ──────────────────────────────────────
  addBtn: {
    width:          54,
    height:         54,
    borderRadius:   27,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   Platform.OS === 'ios' ? 10 : 16,
    // Shadow — iOS
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.35,
    shadowRadius:   8,
    // Shadow — Android
    elevation:      8,
  },
});

export default AppNavigator;
