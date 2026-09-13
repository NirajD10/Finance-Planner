import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nirajdeshmukh.financeplanner',
  appName: 'Finance Planner',
  webDir: 'dist',
  server: {
    // Capacitor defaults the Android WebView's local origin to https://localhost,
    // which triggers Mixed Content blocking against the plain-HTTP dev API
    // (local Docker stack / Android emulator). http://localhost matches the
    // CORS allowlist in server/src/middleware/cors.ts. Revisit once the real
    // deploy is HTTPS end-to-end.
    androidScheme: 'http',
  },
};

export default config;
