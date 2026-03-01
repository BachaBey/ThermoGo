# 🌡️ ThermoGo

**Real-time temperature & battery monitoring for IoT sensor devices.**

---

## 📁 Project Structure

```
ThermoGo/
├── App.js                      # Entry point
├── app.json                    # Expo config
├── package.json
├── babel.config.js
│
├── navigation/
│   └── AppNavigator.js         # Stack + Tab navigation, auth gating
│
├── screens/
│   ├── SignInScreen.js          # Email/password login
│   ├── SignUpScreen.js          # Account creation
│   ├── CurrentStatusScreen.js   # Live temperature & battery
│   ├── TemperatureChartScreen.js # Line chart with date filter
│   ├── NotificationsScreen.js   # Alert history with filters
│   └── AddDeviceScreen.js       # Register new devices
│
├── components/
│   ├── UI.js                   # Button, Input, Card, Badge, Divider
│   └── DeviceSelector.js       # Device picker modal
│
├── services/
│   ├── supabase.js             # Supabase client + all queries
│   ├── AuthContext.js          # React context for auth state
│   └── mockData.js             # Demo data for development
│
└── styles/
    ├── ThemeContext.js          # Light/Dark theme tokens + toggle
    └── typography.js           # Font sizes, spacing, radius constants
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS Simulator / Android Emulator OR Expo Go app on your phone

### 1. Install Dependencies

```bash
cd ThermoGo
npm install
```

### 2. Configure Supabase

Open `services/supabase.js` and replace:
```js
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

> **Demo mode**: The app ships with `USE_MOCK = true` in each screen so you can explore all features immediately without Supabase. Set `USE_MOCK = false` when ready to use real data.

### 3. Run the App

```bash
# Start development server
npm start

# Run on web browser
npm run web

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

---

## 🗄️ Supabase Setup

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New Project

### 2. Run the schema SQL
Copy the SQL from the bottom of `services/supabase.js` and run it in your Supabase **SQL Editor**.

### 3. Enable Realtime
In Supabase Dashboard → **Database → Replication**, make sure `temperature_readings` and `notifications` tables are enabled for realtime.

### 4. Populate test data
Insert some rows into `temperature_readings` and `notifications` via the Supabase Table Editor or SQL:

```sql
-- Insert a test device (replace user_id with your auth.uid())
INSERT INTO devices (user_id, device_id, name)
VALUES ('your-user-id', 'THM-001', 'Freezer Unit A');

-- Insert temperature readings
INSERT INTO temperature_readings (device_id, temperature, battery_level)
VALUES 
  ('THM-001', -18.4, 73),
  ('THM-001', -17.9, 72),
  ('THM-001', -19.1, 71);

-- Insert a notification
INSERT INTO notifications (user_id, device_id, type, message)
VALUES (
  'your-user-id',
  'THM-001',
  'critical_temp',
  'Temperature exceeded safe range: -10.2°C'
);
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 Auth | Email/password sign up & sign in via Supabase Auth |
| 📡 Add Device | Register sensors by Device ID + friendly name |
| 📊 Current Status | Live temperature + battery level with color-coded status indicators |
| 📈 Temperature Chart | Line chart (white bg, black axes, blue #006C95 line) with 24h/3d/7d/30d filters |
| 🔔 Alerts | Filterable alert history with unread count badge |
| 🌙 Dark/Light Mode | Toggle via navbar icon; persists in session |
| ⚡ Realtime | Supabase Postgres subscriptions for live readings + new alerts |
| 📱 Responsive | Works on iOS, Android, and web |

---

## 🎨 Design System

### Colors
| Token | Light | Dark |
|---|---|---|
| Primary | `#006C95` | `#58B9E0` |
| Background | `#F5F7FA` | `#0D1117` |
| Surface | `#FFFFFF` | `#161B22` |
| Danger | `#C0392B` | `#F85149` |
| Warning | `#C87619` | `#E3B341` |
| Success | `#0D8050` | `#3FB950` |

### Chart Colors
- Background: `#FFFFFF`
- Axes & labels: `#000000`
- Data line: `#006C95`

---

## 🔌 Realtime Architecture

```
IoT Sensor → Supabase REST/MQTT → temperature_readings table
                                         ↓
                             Postgres Change → Realtime Channel
                                         ↓
                             subscribeToReadings() → UI update
```

For production, your device firmware should POST to:
```
POST https://your-project.supabase.co/rest/v1/temperature_readings
Authorization: Bearer <service_role_key>
Content-Type: application/json

{ "device_id": "THM-001", "temperature": -18.4, "battery_level": 73 }
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `expo` | Cross-platform React Native framework |
| `@react-navigation/native` | Navigation container |
| `@react-navigation/bottom-tabs` | Bottom tab bar |
| `@react-navigation/native-stack` | Stack navigator |
| `@supabase/supabase-js` | Backend client |
| `react-native-chart-kit` | Temperature line chart |
| `react-native-svg` | SVG support for charts |
| `@react-native-async-storage/async-storage` | Session persistence |
| `react-native-url-polyfill` | URL API for Supabase on RN |

---

## 🛠️ Switching from Mock to Real Data

In each screen file, change:
```js
const USE_MOCK = true;  →  const USE_MOCK = false;
```

Files containing the flag:
- `screens/CurrentStatusScreen.js`
- `screens/TemperatureChartScreen.js`
- `screens/NotificationsScreen.js`
- `screens/AddDeviceScreen.js`
