import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { call, errorMessage } from "@courier/client";
import type { Order } from "@courier/core";
import { client } from "./client";
const TASK = "courier-active-delivery",
  ORDER = "active-delivery-order",
  ERROR = "delivery-location-error";

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK,
  async ({ data, error }) => {
    if (error) {
      await SecureStore.setItemAsync(ERROR, error.message);
      return;
    }
    const orderId = await SecureStore.getItemAsync(ORDER);
    if (!client || !orderId || !data?.locations.length) return;
    const position = data.locations.reduce((a, b) =>
      a.timestamp > b.timestamp ? a : b,
    );
    if (position.coords.accuracy === null || position.coords.accuracy > 100)
      return;
    try {
      await call(client, "locations.publish", {
        role: "courier",
        order_id: orderId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        recorded_at: new Date(position.timestamp).toISOString(),
      });
      await SecureStore.deleteItemAsync(ERROR);
    } catch (e) {
      await SecureStore.setItemAsync(ERROR, errorMessage(e).slice(0, 350));
      if ((e as { code?: string })?.code === "42501") await stopTracking();
    }
  },
);
export async function startTracking(orderId: string) {
  if (!client) throw new Error("Bağlantı yapılandırılmadı.");
  const order = await call<Order>(client, "orders.get", {
    role: "courier",
    order_id: orderId,
  });
  if (!["ready", "picked_up"].includes(order.status))
    throw new Error("Aktif teslimat bulunamadı.");
  if (!(await TaskManager.isAvailableAsync()))
    throw new Error(
      "Konum takibi için geliştirme uygulamasını kullan. Expo Go bu özelliği desteklemez.",
    );
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted")
    throw new Error("Kurye konumu için konum izni gerekli.");
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted")
    throw new Error(
      "Teslimatta arka plan konum izni gerekli. Telefon ayarlarından konum erişimini her zaman açık yap.",
    );
  await SecureStore.setItemAsync(ORDER, orderId);
  await SecureStore.deleteItemAsync(ERROR);
  try {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
      timeInterval: 5000,
      deferredUpdatesInterval: 5000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: "Teslimat konumu paylaşılıyor",
        notificationBody:
          "Konumun aktif siparişin müşteri ve restoranıyla paylaşılıyor.",
        killServiceOnDestroy: true,
      },
    });
  } catch (e) {
    await SecureStore.deleteItemAsync(ORDER);
    throw e;
  }
}
export async function stopTracking() {
  await SecureStore.deleteItemAsync(ORDER);
  if (
    (await TaskManager.isAvailableAsync()) &&
    (await Location.hasStartedLocationUpdatesAsync(TASK))
  )
    await Location.stopLocationUpdatesAsync(TASK);
}
export async function trackingStatus() {
  return {
    orderId: await SecureStore.getItemAsync(ORDER),
    error: await SecureStore.getItemAsync(ERROR),
  };
}
