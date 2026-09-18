import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.yijian.parcels',
  appName: '驿见',
  webDir: 'dist',
  ...(serverUrl ? { server: { url: serverUrl, cleartext: false } } : {}),
};

export default config;