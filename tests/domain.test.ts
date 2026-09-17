import test from "node:test";
import assert from "node:assert/strict";
import {
  canSeeDestination,
  canTransition,
  isLocationFresh,
  navigationUrl,
  roles,
  statuses,
} from "../packages/core/src/index";

test("restoran hiçbir durumda teslimat adresine erişemez", () => {
  for (const status of statuses)
    assert.equal(canSeeDestination("restaurant", status), false);
});
test("kurye adresi sadece teslimat sırasında görebilir", () => {
  for (const status of statuses)
    assert.equal(canSeeDestination("courier", status), status === "picked_up");
});
test("roller sipariş durumlarını atlayamaz veya geri alamaz", () => {
  for (const role of roles) {
    assert.equal(canTransition(role, "delivered", "picked_up"), false);
    assert.equal(canTransition(role, "cancelled", "accepted"), false);
    assert.equal(canTransition(role, "placed", "delivered"), false);
  }
  assert.equal(canTransition("restaurant", "ready", "picked_up"), false);
  assert.equal(canTransition("courier", "ready", "picked_up"), true);
});
test("geçersiz koordinatlar navigasyon URL'sine dönüşmez", () => {
  assert.throws(() => navigationUrl({ latitude: NaN, longitude: 29 }));
  assert.throws(() => navigationUrl({ latitude: 91, longitude: 29 }));
  assert.match(
    navigationUrl({ latitude: 41, longitude: 29 }),
    /destination=41,29/,
  );
});
test("bayat ve geleceğe ait konum canlı olarak işaretlenmez", () => {
  const now = Date.now();
  assert.equal(
    isLocationFresh(new Date(now - 10_000).toISOString(), now),
    true,
  );
  assert.equal(
    isLocationFresh(new Date(now - 31_000).toISOString(), now),
    false,
  );
  assert.equal(
    isLocationFresh(new Date(now + 60_000).toISOString(), now),
    false,
  );
  assert.equal(isLocationFresh("invalid", now), false);
});
