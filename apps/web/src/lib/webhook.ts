import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidPoint } from "@courier/core";
export function verifyDeliverySignature(
  raw: string,
  signature: string | null,
  timestamp: string | null,
  eventId: string | null,
  secret: string,
  now = Date.now(),
): boolean {
  if (!secret || !signature || !timestamp || !eventId) return false;
  if (
    !/^\d{10}$/.test(timestamp) ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
    !uuid.test(eventId)
  )
    return false;
  if (Math.abs(now - Number(timestamp) * 1000) > 300_000) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.${raw}`)
    .digest();
  const actual = Buffer.from(signature.slice(7), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validDeliveryPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.order_id === "string" &&
    uuid.test(p.order_id) &&
    typeof p.courier_id === "string" &&
    uuid.test(p.courier_id) &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    isValidPoint({ latitude: p.latitude, longitude: p.longitude }) &&
    typeof p.accuracy === "number" &&
    Number.isFinite(p.accuracy) &&
    p.accuracy >= 0 &&
    p.accuracy <= 100 &&
    typeof p.recorded_at === "string" &&
    Number.isFinite(Date.parse(p.recorded_at)) &&
    Object.keys(p).every((k) =>
      [
        "order_id",
        "courier_id",
        "latitude",
        "longitude",
        "accuracy",
        "recorded_at",
      ].includes(k),
    )
  );
}
