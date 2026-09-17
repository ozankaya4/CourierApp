import { createClient } from "@supabase/supabase-js";
import {
  validDeliveryPayload,
  verifyDeliverySignature,
} from "../../../../lib/webhook";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY,
    secret = process.env.DELIVERY_WEBHOOK_SECRET;
  if (!url || !key || !secret)
    return Response.json(
      { error: "Webhook yapılandırılmadı." },
      { status: 503 },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "JSON gerekli." }, { status: 415 });
  const limit = 16384,
    reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "İstek gövdesi gerekli." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return Response.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8"),
    eventId = request.headers.get("x-delivery-event-id");
  if (
    !verifyDeliverySignature(
      raw,
      request.headers.get("x-delivery-signature"),
      request.headers.get("x-delivery-timestamp"),
      eventId,
      secret,
    )
  )
    return Response.json({ error: "Geçersiz imza." }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Geçersiz JSON." }, { status: 400 });
  }
  if (!validDeliveryPayload(payload))
    return Response.json({ error: "Geçersiz konum verisi." }, { status: 400 });
  const server = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await server.rpc("delivery_webhook", {
    p_event_id: eventId,
    p_payload: payload,
  });
  if (error)
    return Response.json(
      { error: "Konum olayı işlenemedi." },
      { status: error.code === "42501" ? 403 : 409 },
    );
  return Response.json(data);
}
