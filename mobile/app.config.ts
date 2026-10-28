import type { ExpoConfig } from 'expo/config';

if (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  throw new Error('The native app accepts only a Supabase publishable key. Never put secret or service-role keys in EXPO_PUBLIC variables.');
}

const config: ExpoConfig = {
  name: 'East Eats', slug: 'east-eats', version: '1.0.0',
  scheme: 'easteats', platforms: ['ios', 'android'], orientation: 'portrait', userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.easteats.app', supportsTablet: false, usesAppleSignIn: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'com.easteats.app', allowBackup: false,
    adaptiveIcon: { foregroundImage: './assets/adaptive-foreground.png', backgroundColor: '#E12D12' },
    permissions: ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'],
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.RECORD_AUDIO', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.VIBRATE'],
  },
  plugins: [
    'expo-secure-store', 'expo-web-browser', 'expo-font', 'expo-apple-authentication', 'expo-status-bar', '@maplibre/maplibre-react-native',
    ['expo-location', { locationWhenInUsePermission: 'East Eats uses your location when you ask to find nearby restaurants. You can enter an address instead.', isIosBackgroundLocationEnabled: false, isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }],
    ['expo-splash-screen', { backgroundColor: '#FFFFFF', image: './assets/icon.png', imageWidth: 128 }],
  ],
  extra: {
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
  ...(process.env.EAS_OWNER ? { owner: process.env.EAS_OWNER } : {}),
};
export default config;
