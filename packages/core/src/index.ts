export const roles = ["customer", "restaurant", "courier"] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  customer: "Müşteri",
  restaurant: "Restoran",
  courier: "Kurye",
};
export const statuses = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof statuses)[number];
export const statusLabels: Record<OrderStatus, string> = {
  placed: "Restoran onayı bekleniyor",
  accepted: "Sipariş onaylandı",
  preparing: "Hazırlanıyor",
  ready: "Kurye bekleniyor",
  picked_up: "Yolda",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};
export type Point = { latitude: number; longitude: number };
export type Profile = {
  id: string;
  role: Role;
  display_name: string;
  approved: boolean;
};
export type Restaurant = {
  id: string;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  is_open: boolean;
  delivery_fee: number;
  minimum_order: number;
};
export type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
};
export type OrderItem = {
  id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};
export type Destination = Point & { address: string };
export type CourierLocation = Point & { recorded_at: string; accuracy: number };
export type Order = {
  id: string;
  status: OrderStatus;
  created_at: string;
  total: number;
  restaurant: Pick<
    Restaurant,
    "id" | "name" | "address" | "latitude" | "longitude"
  >;
  courier_id: string | null;
  items: OrderItem[];
  destination: Destination | null;
  location: CourierLocation | null;
  reviewed: boolean;
};
export type CartItem = { menu_item_id: string; quantity: number };
export type ReviewInput = {
  restaurant: number;
  service: number;
  courier: number;
  items: { order_item_id: string; score: number }[];
};
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.includes(value as Role);
}
export function canTransition(
  role: Role,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (role === "customer") return from === "placed" && to === "cancelled";
  if (role === "restaurant")
    return (
      (from === "placed" && ["accepted", "cancelled"].includes(to)) ||
      (from === "accepted" && to === "preparing") ||
      (from === "preparing" && to === "ready")
    );
  return (
    (from === "ready" && to === "picked_up") ||
    (from === "picked_up" && to === "delivered")
  );
}
export function canSeeDestination(role: Role, status: OrderStatus): boolean {
  return role === "customer" || (role === "courier" && status === "picked_up");
}
export function canSeeCourierLocation(
  role: Role,
  status: OrderStatus,
): boolean {
  return (
    status === "ready" || (role !== "restaurant" && status === "picked_up")
  );
}
export function isValidPoint(point: Point): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}
export function navigationUrl(point: Point): string {
  if (!isValidPoint(point)) throw new Error("Geçersiz konum.");
  return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&travelmode=driving&dir_action=navigate`;
}
export function isLocationFresh(recordedAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(recordedAt);
  return Number.isFinite(age) && age >= -30_000 && age <= 30_000;
}
export function money(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}
