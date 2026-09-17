import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

test("gerçek PostgreSQL üzerinde hesap, adres gizliliği, sipariş ve puanlama sınırları", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key);
      create role anon;
      create role authenticated;
      create role service_role;
      grant usage on schema auth to authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create publication supabase_realtime;
    `);
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20260917141109_initial_delivery.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const users = {
      customer: randomUUID(),
      restaurant: randomUUID(),
      courier: randomUUID(),
      stranger: randomUUID(),
    };
    for (const id of Object.values(users))
      await db.query("insert into auth.users values($1)", [id]);
    async function asUser(id: string, fn: () => Promise<unknown>) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
      }
    }
    async function rpc(action: string, payload: object = {}): Promise<any> {
      const result = await db.query<{ value: unknown }>(
        "select public.app($1,$2::jsonb) as value",
        [action, JSON.stringify(payload)],
      );
      return result.rows[0]?.value;
    }
    const profileIds: Record<string, string> = {};
    for (const [role, id] of Object.entries(users)) {
      const selected = role === "stranger" ? "customer" : role;
      const profile = (await asUser(id, () =>
        rpc("profiles.create", {
          role: selected,
          display_name: `Test ${role}`,
        }),
      )) as { id: string };
      profileIds[role] = profile.id;
    }
    await assert.rejects(
      asUser(users.customer, () =>
        rpc("profiles.create", {
          role: "customer",
          display_name: "İkinci müşteri",
        }),
      ),
      /unique/,
    );
    await asUser(users.customer, () =>
      rpc("profiles.create", {
        role: "restaurant",
        display_name: "Diğer profil",
      }),
    );
    const profiles = (await asUser(users.customer, () =>
      rpc("profiles.list"),
    )) as unknown[];
    assert.equal(profiles.length, 2);
    await assert.rejects(
      asUser(users.restaurant, () =>
        rpc("restaurant.save", { role: "restaurant" }),
      ),
      /henüz/,
    );
    await db.exec(
      "update private.profiles set approved=true where role in ('restaurant','courier')",
    );
    await asUser(users.restaurant, () =>
      rpc("restaurant.save", {
        role: "restaurant",
        name: "Test Mutfağı",
        address: "Restoran adresi 123",
        latitude: 41,
        longitude: 29,
        is_open: true,
        delivery_fee: 2500,
        minimum_order: 10000,
      }),
    );
    const menu = (await asUser(users.restaurant, () =>
      rpc("menu.save", {
        role: "restaurant",
        name: "Mercimek çorbası",
        price: 12000,
      }),
    )) as { id: string };
    const request = {
      role: "customer",
      restaurant_id: profileIds.restaurant,
      request_id: randomUUID(),
      address: "GİZLİ MÜŞTERİ ADRESİ",
      latitude: 40.98,
      longitude: 29.12,
      items: [{ menu_item_id: menu.id, quantity: 2 }],
      total: 1,
    };
    const created = (await asUser(users.customer, () =>
      rpc("orders.create", request),
    )) as { id: string };
    const orderId = created.id;
    const retry = (await asUser(users.customer, () =>
      rpc("orders.create", request),
    )) as { id: string };
    assert.equal(retry.id, orderId);
    await assert.rejects(
      asUser(users.customer, () =>
        rpc("orders.create", { ...request, address: "Başka adres" }),
      ),
      /farklı/,
    );
    const get = (role: string) => ({ role, order_id: orderId });
    let customerOrder = (await asUser(users.customer, () =>
      rpc("orders.get", get("customer")),
    )) as any;
    assert.equal(
      customerOrder.total,
      26500,
      "istemciden gönderilen sahte fiyat kullanılmaz",
    );
    assert.equal(customerOrder.destination.address, request.address);
    for (const role of ["restaurant", "courier"]) {
      if (role === "courier") continue;
      const order = (await asUser(users.restaurant, () =>
        rpc("orders.get", get(role)),
      )) as any;
      assert.equal(order.destination, null);
      assert.equal(JSON.stringify(order).includes(request.address), false);
    }
    await assert.rejects(
      asUser(users.stranger, () => rpc("orders.get", get("customer"))),
      /erişim yok/,
    );
    await assert.rejects(
      asUser(users.customer, () => db.query("select * from private.orders")),
      /permission denied/,
    );
    await assert.rejects(
      asUser(users.restaurant, () =>
        rpc("orders.transition", { ...get("restaurant"), status: "picked_up" }),
      ),
      /izin verilmiyor/,
    );
    await assert.rejects(
      asUser(users.customer, () =>
        rpc("reviews.create", {
          ...get("customer"),
          restaurant: 5,
          service: 5,
          courier: 5,
          items: [],
        }),
      ),
      /teslim edilen/,
    );
    for (const status of ["accepted", "preparing", "ready"])
      await asUser(users.restaurant, () =>
        rpc("orders.transition", { ...get("restaurant"), status }),
      );
    await asUser(users.courier, () => rpc("orders.claim", get("courier")));
    let courierOrder = (await asUser(users.courier, () =>
      rpc("orders.get", get("courier")),
    )) as any;
    assert.equal(courierOrder.destination, null);
    await assert.rejects(
      asUser(users.courier, () => rpc("orders.claim", get("courier"))),
      /başka bir kurye/,
    );
    await assert.rejects(
      asUser(users.stranger, () =>
        db.query("insert into public.order_events(order_id) values($1)", [
          orderId,
        ]),
      ),
      /permission denied/,
    );
    const strangerEvents = (await asUser(users.stranger, () =>
      db.query("select * from public.order_events"),
    )) as any;
    assert.equal(strangerEvents.rows.length, 0);
    const restaurantEvents = (await asUser(users.restaurant, () =>
      db.query("select * from public.order_events"),
    )) as any;
    assert.equal(restaurantEvents.rows.length, 1);
    assert.deepEqual(Object.keys(restaurantEvents.rows[0]).sort(), [
      "order_id",
      "revision",
      "updated_at",
    ]);
    await asUser(users.courier, () =>
      rpc("locations.publish", {
        ...get("courier"),
        latitude: 41.01,
        longitude: 29.02,
        accuracy: 10,
        recorded_at: new Date().toISOString(),
      }),
    );
    const live = (await asUser(users.restaurant, () =>
      rpc("orders.get", get("restaurant")),
    )) as any;
    assert.equal(live.location.latitude, 41.01);
    assert.equal(live.destination, null);
    await assert.rejects(
      asUser(users.courier, () =>
        rpc("locations.publish", {
          ...get("courier"),
          latitude: 41,
          longitude: 29,
          accuracy: 10,
          recorded_at: "2020-01-01T00:00:00Z",
        }),
      ),
      /zaman damgası/,
    );
    courierOrder = (await asUser(users.courier, () =>
      rpc("orders.transition", { ...get("courier"), status: "picked_up" }),
    )) as any;
    assert.equal(courierOrder.destination.address, request.address);
    await db.query(
      "update private.locations set received_at = clock_timestamp() - interval '4 seconds' where order_id = $1",
      [orderId],
    );
    await asUser(users.courier, () =>
      rpc("locations.publish", {
        ...get("courier"),
        latitude: 41.025,
        longitude: 29.035,
        accuracy: 10,
        recorded_at: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    const customerOnTheWay = (await asUser(users.customer, () =>
      rpc("orders.get", get("customer")),
    )) as any;
    assert.equal(customerOnTheWay.status, "picked_up");
    assert.equal(customerOnTheWay.location.latitude, 41.025);
    assert.equal(customerOnTheWay.location.longitude, 29.035);
    const restaurantPickedUp = (await asUser(users.restaurant, () =>
      rpc("orders.get", get("restaurant")),
    )) as any;
    assert.equal(restaurantPickedUp.destination, null);
    assert.equal(
      restaurantPickedUp.location,
      null,
      "Restoran müşteri güzergâhını izleyemez",
    );
    assert.equal(restaurantPickedUp.status, "picked_up");
    const restaurantList = (await asUser(users.restaurant, () =>
      rpc("orders.list", { role: "restaurant" }),
    )) as any[];
    assert.equal(restaurantList.length, 1);
    assert.equal(restaurantList[0].status, "picked_up");
    assert.equal(restaurantList[0].location, null);
    assert.equal(restaurantList[0].destination, null);
    courierOrder = (await asUser(users.courier, () =>
      rpc("orders.transition", { ...get("courier"), status: "delivered" }),
    )) as any;
    assert.equal(courierOrder.destination, null);
    assert.equal(courierOrder.location, null);
    await assert.rejects(
      asUser(users.courier, () =>
        rpc("locations.publish", {
          ...get("courier"),
          latitude: 41,
          longitude: 29,
          accuracy: 10,
          recorded_at: new Date().toISOString(),
        }),
      ),
      /Aktif teslimata/,
    );
    customerOrder = (await asUser(users.customer, () =>
      rpc("orders.get", get("customer")),
    )) as any;
    const review = {
      ...get("customer"),
      restaurant: 4,
      service: 3,
      courier: 5,
      items: customerOrder.items.map((i: any) => ({
        order_item_id: i.id,
        score: 4,
      })),
    };
    await assert.rejects(
      asUser(users.customer, () =>
        rpc("reviews.create", { ...review, restaurant: 6 }),
      ),
      /check constraint/,
    );
    await assert.rejects(
      asUser(users.customer, () =>
        rpc("reviews.create", {
          ...review,
          items: [{ order_item_id: randomUUID(), score: 5 }],
        }),
      ),
      /bu siparişe ait değil/,
    );
    await asUser(users.customer, () => rpc("reviews.create", review));
    await assert.rejects(
      asUser(users.customer, () => rpc("reviews.create", review)),
      /unique/,
    );
    assert.equal(
      (await db.query("select * from private.reviews")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from private.item_reviews")).rows.length,
      1,
    );
    await assert.rejects(
      asUser(users.customer, () =>
        db.query("select public.delivery_webhook($1,'{}')", [randomUUID()]),
      ),
      /permission denied/,
    );
    await db.exec("set role anon");
    await assert.rejects(rpc("profiles.list"), /permission denied/);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
