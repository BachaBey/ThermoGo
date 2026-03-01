// Mock data matching the exact Supabase schema.
// Used when SUPABASE_URL is still set to placeholder.

export const MOCK_PROFILE = {
  id: 'mock-user-uuid-0001',
  first_name: 'Alex',
  last_name: 'Martin',
  phone: '+216 55 123 456',
  created_at: '2024-01-10T08:00:00Z',
};

// devices: id (uuid PK), device_id (text), user_id (uuid), connected_at
export const MOCK_DEVICES = [
  {
    id: 'device-uuid-0001',
    device_id: 'THM-001',
    user_id: 'mock-user-uuid-0001',
    connected_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'device-uuid-0002',
    device_id: 'THM-002',
    user_id: 'mock-user-uuid-0001',
    connected_at: '2024-01-20T09:00:00Z',
  },
];

// sensor_readings: id (bigint), device_id (uuid→devices.id), temperature, humidity, created_at
export const MOCK_LATEST_READING = {
  id: 9999,
  device_id: 'device-uuid-0001',
  temperature: -18.4,
  humidity: 65.2,
  created_at: new Date().toISOString(),
};

/** Generate realistic hourly readings for the last N days */
export const generateMockHistory = (deviceUuid = 'device-uuid-0001', days = 7) => {
  const data = [];
  const now = new Date();
  let id = 1;
  for (let i = days - 1; i >= 0; i--) {
    for (let h = 0; h < 24; h += 3) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(h, 0, 0, 0);
      data.push({
        id: id++,
        device_id: deviceUuid,
        temperature: parseFloat((-18 + (Math.random() * 4 - 2)).toFixed(2)),
        humidity: parseFloat((60 + (Math.random() * 10 - 5)).toFixed(2)),
        created_at: new Date(date).toISOString(),
      });
    }
  }
  return data;
};

export const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    type: 'critical_temp',
    message: 'Temperature exceeded safe range: -10.2°C (threshold: -15°C)',
    device_id: 'device-uuid-0001',
    devices: { device_id: 'THM-001' },
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    type: 'low_battery',
    message: 'Battery level critically low: 12%.',
    device_id: 'device-uuid-0002',
    devices: { device_id: 'THM-002' },
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: '3',
    type: 'offline',
    message: 'Device went offline. Last seen 3 hours ago.',
    device_id: 'device-uuid-0001',
    devices: { device_id: 'THM-001' },
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: '4',
    type: 'critical_temp',
    message: 'Temperature dropped below minimum: -25.8°C',
    device_id: 'device-uuid-0002',
    devices: { device_id: 'THM-002' },
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];
