import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  return {
    ...config,
    name: "Courier",
    slug: "courier",
    version: "0.1.0",
    scheme: "courier",
    orientation: "portrait",
    userInterfaceStyle: "light",
    ios: { supportsTablet: false, bundleIdentifier: "com.courier.delivery" },
    android: {
      package: "com.courier.delivery",
      config: {
        googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "" },
      },
    },
    plugins: [
      "expo-secure-store",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Aktif teslimat sırasında konumunu müşteri ve restoranla paylaşmak için konum izni gerekir.",
          locationWhenInUsePermission:
            "Teslimat adresini seçmek ve kurye konumunu paylaşmak için konum izni gerekir.",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    runtimeVersion: { policy: "fingerprint" },
    updates: projectId
      ? {
          url: `https://u.expo.dev/${projectId}`,
          checkAutomatically: "ON_LOAD",
          fallbackToCacheTimeout: 0,
        }
      : { enabled: false },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
