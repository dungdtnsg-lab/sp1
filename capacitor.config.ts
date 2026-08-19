import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gps.speedometer.app",
  appName: "GPS Speedometer",
  webDir: "www",
  backgroundColor: "#080a10",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "GPS Speedometer",
  },
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
  },
};

export default config;
