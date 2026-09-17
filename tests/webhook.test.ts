import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import {
  verifyDeliverySignature,
  validDeliveryPayload,
} from "../apps/web/src/lib/webhook";
test("webhook imzası gövdeyi, olay kimliğini ve zamanı bağlar", () => {
  const now = Date.now(),
    time = String(Math.floor(now / 1000)),
    id = randomUUID(),
    secret = "test-secret",
    raw = '{"latitude":41}';
  const sig =
    "sha256=" +
    createHmac("sha256", secret).update(`${time}.${id}.${raw}`).digest("hex");
  assert.equal(verifyDeliverySignature(raw, sig, time, id, secret, now), true);
  assert.equal(
    verifyDeliverySignature(raw + " ", sig, time, id, secret, now),
    false,
  );
  assert.equal(
    verifyDeliverySignature(raw, sig, time, randomUUID(), secret, now),
    false,
  );
  assert.equal(
    verifyDeliverySignature(raw, sig, time, id, secret, now + 301000),
    false,
  );
  assert.equal(
    verifyDeliverySignature(raw, "sha256=abc", time, id, secret, now),
    false,
  );
  assert.equal(verifyDeliverySignature(raw, sig, time, id, "", now), false);
});
test("webhook müşteri adresini ve geçersiz konumu kabul etmez", () => {
  const payload = {
    order_id: randomUUID(),
    courier_id: randomUUID(),
    latitude: 41,
    longitude: 29,
    accuracy: 10,
    recorded_at: new Date().toISOString(),
  };
  assert.equal(validDeliveryPayload(payload), true);
  assert.equal(validDeliveryPayload({ ...payload, address: "secret" }), false);
  assert.equal(validDeliveryPayload({ ...payload, accuracy: 101 }), false);
  assert.equal(validDeliveryPayload({ ...payload, latitude: 91 }), false);
});
