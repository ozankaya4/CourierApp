"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  call,
  errorMessage,
  useAuth,
  useProfiles,
  useWorkspace,
} from "@courier/client";
import {
  canTransition,
  isLocationFresh,
  money,
  navigationUrl,
  roleLabels,
  roles,
  statuses,
  statusLabels,
  type CartItem,
  type MenuItem,
  type Order,
  type Restaurant,
  type Role,
} from "@courier/core";
import { client } from "../lib/client";
const OrderMap = dynamic(() => import("./order-map"), {
  ssr: false,
  loading: () => <p>Harita yükleniyor…</p>,
});

function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        {...rest}
      />
    </label>
  );
}
function Form({
  children,
  onSave,
  label,
  disabled = false,
}: {
  children: ReactNode;
  onSave: (data: FormData) => Promise<void>;
  label: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="form-stack">
      <fieldset disabled={busy || disabled}>{children}</fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy || disabled}>{busy ? "İşleniyor…" : label}</button>
    </form>
  );
}
const number = (data: FormData, key: string) => Number(data.get(key));
const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

export function Dashboard() {
  const auth = useAuth(client);
  const profiles = useProfiles(client, auth.session?.user.id);
  const [role, setRole] = useState<Role | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [tab, setTab] = useState("discover");
  const active = profiles.profiles.find((p) => p.role === role);
  const workspace = useWorkspace(
    client,
    auth.session?.user.id,
    role,
    Boolean(active?.approved),
  );
  useEffect(() => {
    if (!role && profiles.profiles[0]) setRole(profiles.profiles[0].role);
  }, [profiles.profiles, role]);
  useEffect(() => {
    if (!auth.session) {
      setRole(null);
      setMessage("");
    }
  }, [auth.session]);
  useEffect(() => {
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  async function action(name: string, payload: object = {}) {
    if (!client || !role) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await call<Order>(client, name, { role, ...payload });
      await workspace.refresh();
      return result;
    } catch (e) {
      setMessage(errorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setMessage(errorMessage(error));
  }
  return (
    <>
      <header className="topbar">
        <a href="/" className="brand" aria-label="Courier ana sayfa">
          courier<span className="brand-dot">.</span>
        </a>
        <span className="brand-caption">İyi yemek, doğru adrese.</span>
        {auth.session && (
          <div className="account">
            <select
              aria-label="Aktif hesap türü"
              value={role ?? ""}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setTab("discover");
                setMessage("");
              }}
            >
              {!role && <option value="">Hesap seç</option>}
              {profiles.profiles.map((p) => (
                <option key={p.id} value={p.role}>
                  {roleLabels[p.role]}
                </option>
              ))}
            </select>
            <button className="text-button" onClick={() => void signOut()}>
              Çıkış yap
            </button>
          </div>
        )}
      </header>
      {!auth.session ? (
        <main className="welcome">
          <section className="welcome-story">
            <span className="tag">Mahallenden kapına</span>
            <h1>
              Yemeğin
              <br />
              yola çıksın.
            </h1>
            <p>
              Sevdiğin yemeği seç.
              <br />
              Hazırlanışından kapına gelişine kadar takip et.
            </p>
            <ol className="journey">
              <li>
                <span>1</span>Mutfağını seç
              </li>
              <li>
                <span>2</span>Siparişini takip et
              </li>
              <li>
                <span>3</span>Afiyetle ye
              </li>
            </ol>
            <div className="story-note">
              Müşteri, restoran ve kurye.
              <br />
              Aynı yolculuğun üç parçası.
            </div>
          </section>
          <section className="login-panel">
            <h2>Hoş geldin</h2>
            <p className="muted">
              Tek hesabınla sipariş ver, restoranını yönet veya teslimata çık.
            </p>
            {!client && (
              <div className="notice">
                Bağlantı henüz kurulmadı. Geliştirme ortamının kurulumu için
                proje içindeki <strong>docs/KURULUM.md</strong> dosyasını izle.
              </div>
            )}
            {auth.error && (
              <p role="alert" className="error">
                {auth.error}
              </p>
            )}
            <AuthForm
              disabled={!client || auth.loading}
              onMessage={setMessage}
            />
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
          </section>
        </main>
      ) : (
        <main className="workspace">
          {recovery ? (
            <section className="panel narrow">
              <h1>Yeni şifre belirle</h1>
              <Form
                label="Şifreyi güncelle"
                onSave={async (data) => {
                  const { error } = await client!.auth.updateUser({
                    password: text(data, "password"),
                  });
                  if (error) throw error;
                  setRecovery(false);
                  setMessage("Şifren güncellendi.");
                }}
              >
                <Field
                  label="Yeni şifre (en az 8 karakter)"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                />
              </Form>
            </section>
          ) : (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="muted">
                    {active
                      ? roleLabels[active.role] + " hesabı"
                      : "Hesabını tamamla"}
                  </p>
                  <h1>
                    {active
                      ? role === "customer"
                        ? "Bugün ne yesek?"
                        : role === "restaurant"
                          ? "Mutfakta neler oluyor?"
                          : "Sıradaki teslimatın."
                      : "Bir profil oluştur."}
                  </h1>
                </div>
                {active?.approved && (
                  <button
                    className="secondary"
                    onClick={() => void workspace.refresh()}
                  >
                    Yenile
                  </button>
                )}
              </div>
              {(message || profiles.error || workspace.error) && (
                <p className="notice" role="status">
                  {message || profiles.error || workspace.error}
                </p>
              )}
              {profiles.loading && !profiles.profiles.length && (
                <p>Profiller yükleniyor…</p>
              )}
              {active && !active.approved && (
                <section className="panel">
                  <h2>Başvurun alındı</h2>
                  <p>
                    Profilin onaylandıktan sonra{" "}
                    {role === "restaurant"
                      ? "restoranını yönetebilir"
                      : "teslimat alabilir"}
                    sin.
                  </p>
                  <button onClick={() => void profiles.refresh()}>
                    Onay durumunu kontrol et
                  </button>
                </section>
              )}
              {active?.approved && (
                <>
                  <nav className="tabs" aria-label="Hesap bölümleri">
                    {(role === "customer"
                      ? [
                          ["discover", "Restoranlar"],
                          ["orders", "Siparişlerim"],
                        ]
                      : role === "restaurant"
                        ? [
                            ["discover", "Siparişler"],
                            ["manage", "Restoran ve menü"],
                          ]
                        : [["discover", "Teslimatlar"]]
                    ).map(([id, label]) => (
                      <button
                        className={tab === id ? "selected" : ""}
                        key={id}
                        onClick={() => setTab(id!)}
                      >
                        {label}
                      </button>
                    ))}
                    <span className="connection">
                      {workspace.connected
                        ? "Güncellemeler bağlı"
                        : "Yeniden bağlanılıyor"}
                    </span>
                  </nav>
                  {role === "customer" && tab === "discover" ? (
                    <Catalog
                      key={active.id}
                      restaurants={workspace.restaurants}
                      menu={workspace.menu}
                      onOrder={async (payload) => {
                        await action("orders.create", payload);
                        setTab("orders");
                      }}
                    />
                  ) : role === "restaurant" && tab === "manage" ? (
                    <RestaurantManager
                      restaurant={workspace.restaurants.find(
                        (r) => r.id === active.id,
                      )}
                      menu={workspace.menu.filter(
                        (m) => m.restaurant_id === active.id,
                      )}
                      onSave={action}
                    />
                  ) : (
                    <div className="orders">
                      {workspace.orders.length === 0 ? (
                        <div className="empty">
                          <h2>
                            {role === "courier"
                              ? "Şu an bekleyen teslimat yok."
                              : "Henüz sipariş yok."}
                          </h2>
                          <p>
                            {role === "customer"
                              ? "Restoranlardan ilk siparişini verebilirsin."
                              : "Yeni siparişler burada görünecek."}
                          </p>
                        </div>
                      ) : (
                        workspace.orders.map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            role={role!}
                            profileId={active.id}
                            busy={busy}
                            onAction={action}
                          />
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
              {profiles.profiles.length < 3 && (
                <details
                  className="profile-create"
                  open={!profiles.profiles.length}
                >
                  <summary>
                    {profiles.profiles.length
                      ? "Başka bir hesap türü ekle"
                      : "İlk profilini oluştur"}
                  </summary>
                  <Form
                    label="Profili oluştur"
                    onSave={async (data) => {
                      await call(client!, "profiles.create", {
                        role: text(data, "role"),
                        display_name: text(data, "display_name"),
                      });
                      await profiles.refresh();
                      setRole(text(data, "role") as Role);
                      setTab("discover");
                    }}
                  >
                    <Field label="Görünen adın" name="display_name" />
                    <label className="field">
                      Hesap türü
                      <select name="role">
                        {roles
                          .filter(
                            (r) => !profiles.profiles.some((p) => p.role === r),
                          )
                          .map((r) => (
                            <option key={r} value={r}>
                              {roleLabels[r]}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="muted">
                      Restoran ve kurye hesapları onay sonrası kullanıma açılır.
                    </p>
                  </Form>
                </details>
              )}
            </>
          )}
        </main>
      )}
      <footer>
        courier. <span>Her siparişte, birlikte.</span>
      </footer>
    </>
  );
}
function AuthForm({
  disabled,
  onMessage,
}: {
  disabled: boolean;
  onMessage: (message: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  return (
    <>
      <div className="auth-tabs">
        <button
          className={mode === "login" ? "selected" : ""}
          onClick={() => setMode("login")}
        >
          Giriş yap
        </button>
        <button
          className={mode === "register" ? "selected" : ""}
          onClick={() => setMode("register")}
        >
          Kayıt ol
        </button>
      </div>
      <Form
        disabled={disabled}
        label={
          mode === "register"
            ? "Hesap oluştur"
            : mode === "reset"
              ? "Sıfırlama bağlantısı gönder"
              : "Giriş yap"
        }
        onSave={async (data) => {
          if (!client) return;
          const email = text(data, "email").toLowerCase(),
            password = String(data.get("password") ?? "");
          if (mode !== "reset" && password.length < 8)
            throw new Error("Şifren en az 8 karakter olmalı.");
          const result =
            mode === "register"
              ? await client.auth.signUp({
                  email,
                  password,
                  options: { emailRedirectTo: window.location.origin },
                })
              : mode === "reset"
                ? await client.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                  })
                : await client.auth.signInWithPassword({ email, password });
          if (result.error) throw result.error;
          if (mode !== "login")
            onMessage(
              "E-posta adresin uygunsa doğrulama veya sıfırlama bağlantısı gönderildi. Gelen kutunu kontrol et.",
            );
        }}
      >
        <Field
          label="E-posta adresin"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ornek@mail.com"
        />
        {mode !== "reset" && (
          <Field
            label="Şifren"
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        )}
      </Form>
      <button
        className="text-button forgot"
        onClick={() => setMode(mode === "reset" ? "login" : "reset")}
      >
        {mode === "reset" ? "Girişe dön" : "Şifremi unuttum"}
      </button>
    </>
  );
}
function Catalog({
  restaurants,
  menu,
  onOrder,
}: {
  restaurants: Restaurant[];
  menu: MenuItem[];
  onOrder: (payload: object) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]),
    [requestId, setRequestId] = useState("");
  const [location, setLocation] = useState<{
      latitude: number;
      longitude: number;
    } | null>(null),
    [geoError, setGeoError] = useState("");
  const restaurant = restaurants.find((r) => r.id === selected);
  const subtotal = cart.reduce(
    (sum, c) =>
      sum +
      (menu.find((m) => m.id === c.menu_item_id)?.price ?? 0) * c.quantity,
    0,
  );
  const change = (id: string, amount: number) => {
    setRequestId(crypto.randomUUID());
    setCart((c) => {
      const next = c.map((i) => ({ ...i })),
        existing = next.find((i) => i.menu_item_id === id);
      if (existing)
        existing.quantity = Math.min(20, existing.quantity + amount);
      else if (amount > 0) next.push({ menu_item_id: id, quantity: 1 });
      return next.filter((i) => i.quantity > 0);
    });
  };
  return (
    <div className="catalog-layout">
      <section>
        <label className="search">
          Restoran ara
          <input
            type="search"
            placeholder="Canın ne çekiyor?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {!restaurants.length && (
          <div className="empty">
            <h2>İlk mutfaklar hazırlanıyor.</h2>
            <p>Siparişe açık restoranlar burada listelenecek.</p>
          </div>
        )}
        <div className="restaurant-list">
          {restaurants
            .filter((r) =>
              r.name
                .toLocaleLowerCase("tr")
                .includes(search.toLocaleLowerCase("tr")),
            )
            .map((r) => (
              <button
                className={`restaurant-choice ${selected === r.id ? "active" : ""}`}
                key={r.id}
                onClick={() => {
                  setSelected(r.id);
                  setCart([]);
                  setRequestId(crypto.randomUUID());
                }}
              >
                <span className="restaurant-initial">{r.name.slice(0, 1)}</span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.description || r.address}</small>
                  <small>
                    {r.is_open ? "Siparişe açık" : "Şu an kapalı"} · Min.{" "}
                    {money(r.minimum_order)} · Teslimat {money(r.delivery_fee)}
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
        </div>
        {restaurant && (
          <section className="menu-section">
            <h2>{restaurant.name} menüsü</h2>
            {menu
              .filter((m) => m.restaurant_id === selected && m.available)
              .map((m) => (
                <article className="menu-row" key={m.id}>
                  <div>
                    <h3>{m.name}</h3>
                    <p>{m.description}</p>
                    <strong>{money(m.price)}</strong>
                  </div>
                  <button
                    className="add-button"
                    aria-label={`${m.name} sepete ekle`}
                    disabled={!restaurant.is_open}
                    onClick={() => change(m.id, 1)}
                  >
                    +
                  </button>
                </article>
              ))}
          </section>
        )}
      </section>
      <aside className="basket">
        <h2>Sepetin</h2>
        {!cart.length ? (
          <p className="muted">
            Güzel bir yemekle başlayalım.
            <br />
            Menüden bir şeyler seç.
          </p>
        ) : (
          <>
            {cart.map((c) => (
              <div className="basket-row" key={c.menu_item_id}>
                <span>{menu.find((m) => m.id === c.menu_item_id)?.name}</span>
                <div className="quantity">
                  <button
                    aria-label="Adedi azalt"
                    onClick={() => change(c.menu_item_id, -1)}
                  >
                    −
                  </button>
                  <span>{c.quantity}</span>
                  <button
                    aria-label="Adedi artır"
                    onClick={() => change(c.menu_item_id, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div className="total">
              <span>
                Toplam <small>teslimat dahil</small>
              </span>
              <strong>
                {money(subtotal + (restaurant?.delivery_fee ?? 0))}
              </strong>
            </div>
            <Form
              label="Kapıda ödemeyle sipariş ver"
              onSave={async (data) => {
                await onOrder({
                  restaurant_id: selected,
                  items: cart,
                  address: text(data, "address"),
                  latitude: number(data, "latitude"),
                  longitude: number(data, "longitude"),
                  request_id: requestId,
                });
                setCart([]);
                setRequestId(crypto.randomUUID());
              }}
            >
              <Field
                label="Açık adres, bina ve daire"
                name="address"
                autoComplete="street-address"
              />
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setGeoError("");
                  if (!navigator.geolocation) {
                    setGeoError("Bu tarayıcı konum paylaşımını desteklemiyor.");
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (p) =>
                      setLocation({
                        latitude: p.coords.latitude,
                        longitude: p.coords.longitude,
                      }),
                    () =>
                      setGeoError(
                        "Konum alınamadı. Konum iznini aç veya koordinatları gir.",
                      ),
                    { enableHighAccuracy: true, timeout: 15000 },
                  );
                }}
              >
                Bulunduğum konumu al
              </button>
              {geoError && <p className="error">{geoError}</p>}
              <div
                className="two-fields"
                key={
                  location
                    ? `${location.latitude},${location.longitude}`
                    : "manual"
                }
              >
                <Field
                  label="Enlem"
                  name="latitude"
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  value={location?.latitude}
                />
                <Field
                  label="Boylam"
                  name="longitude"
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  value={location?.longitude}
                />
              </div>
              <p className="muted">
                Konumunun teslimat adresine ait olduğunu kontrol et.
              </p>
            </Form>
          </>
        )}
      </aside>
    </div>
  );
}
function RestaurantManager({
  restaurant,
  menu,
  onSave,
}: {
  restaurant?: Restaurant;
  menu: MenuItem[];
  onSave: (action: string, payload: object) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<MenuItem | null>(null);
  return (
    <div className="management">
      <section className="panel">
        <h2>Restoran bilgileri</h2>
        <Form
          label="Restoranı kaydet"
          onSave={async (data) => {
            await onSave("restaurant.save", {
              name: text(data, "name"),
              description: text(data, "description"),
              address: text(data, "address"),
              latitude: number(data, "latitude"),
              longitude: number(data, "longitude"),
              delivery_fee: Math.round(number(data, "delivery_fee") * 100),
              minimum_order: Math.round(number(data, "minimum_order") * 100),
              is_open: data.get("is_open") === "on",
            });
          }}
        >
          <Field label="Restoran adı" name="name" value={restaurant?.name} />
          <Field
            label="Kısa açıklama"
            name="description"
            value={restaurant?.description}
            required={false}
          />
          <Field
            label="Restoran adresi"
            name="address"
            value={restaurant?.address}
          />
          <div className="two-fields">
            <Field
              label="Enlem"
              name="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={restaurant?.latitude}
            />
            <Field
              label="Boylam"
              name="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={restaurant?.longitude}
            />
            <Field
              label="Teslimat ücreti (TL)"
              name="delivery_fee"
              type="number"
              min={0}
              step="0.01"
              value={(restaurant?.delivery_fee ?? 0) / 100}
            />
            <Field
              label="Minimum sipariş (TL)"
              name="minimum_order"
              type="number"
              min={0}
              step="0.01"
              value={(restaurant?.minimum_order ?? 0) / 100}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              name="is_open"
              defaultChecked={restaurant?.is_open}
            />{" "}
            Sipariş almaya açık
          </label>
        </Form>
      </section>
      <section className="panel">
        <h2>{editing ? "Yemeği düzenle" : "Menüye yemek ekle"}</h2>
        {restaurant ? (
          <Form
            key={editing?.id ?? "new"}
            label="Yemeği kaydet"
            onSave={async (data) => {
              await onSave("menu.save", {
                id: editing?.id,
                name: text(data, "name"),
                description: text(data, "description"),
                price: Math.round(number(data, "price") * 100),
                available: data.get("available") === "on",
              });
              setEditing(null);
            }}
          >
            <Field label="Yemek adı" name="name" value={editing?.name} />
            <Field
              label="İçindekiler ve açıklama"
              name="description"
              value={editing?.description}
              required={false}
            />
            <Field
              label="Fiyat (TL)"
              name="price"
              type="number"
              min={0.01}
              step="0.01"
              value={editing ? editing.price / 100 : undefined}
            />
            <label className="check">
              <input
                name="available"
                type="checkbox"
                defaultChecked={editing?.available ?? true}
              />{" "}
              Satışta
            </label>
          </Form>
        ) : (
          <p>Önce restoran bilgilerini kaydet.</p>
        )}
        {editing && (
          <button className="text-button" onClick={() => setEditing(null)}>
            Yeni yemek eklemeye dön
          </button>
        )}
        {menu.map((m) => (
          <div className="menu-row" key={m.id}>
            <span>
              {m.name}
              <small>
                {money(m.price)} · {m.available ? "Satışta" : "Tükendi"}
              </small>
            </span>
            <button className="secondary" onClick={() => setEditing(m)}>
              Düzenle
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
function OrderCard({
  order,
  role,
  profileId,
  busy,
  onAction,
}: {
  order: Order;
  role: Role;
  profileId: string;
  busy: boolean;
  onAction: (name: string, payload: object) => Promise<Order | undefined>;
}) {
  const [now, setNow] = useState(Date.now()),
    [tracking, setTracking] = useState(false),
    [geoError, setGeoError] = useState("");
  const assigned = order.courier_id === profileId;
  const active = assigned && ["ready", "picked_up"].includes(order.status);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!tracking || !active || role !== "courier" || !client) return;
    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (Date.now() - lastSent < 5000 || position.coords.accuracy > 100)
          return;
        lastSent = Date.now();
        void call(client!, "locations.publish", {
          role,
          order_id: order.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          recorded_at: new Date(position.timestamp).toISOString(),
        }).catch((e) => setGeoError(errorMessage(e)));
      },
      () => {
        setGeoError("Konum izni alınamadı. Tarayıcı izinlerini kontrol et.");
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [tracking, active, role, order.id]);
  async function change(status: string) {
    try {
      const updated = await onAction("orders.transition", {
        order_id: order.id,
        status,
      });
      if (status === "picked_up" && updated?.destination)
        window.location.assign(navigationUrl(updated.destination));
    } catch {}
  }
  return (
    <article className="order-card">
      <div className="order-heading">
        <div>
          <small>Sipariş #{order.id.slice(0, 8)}</small>
          <h2>{order.restaurant.name}</h2>
        </div>
        <span className={`status status-${order.status}`}>
          {statusLabels[order.status]}
        </span>
      </div>
      <p className="muted">
        {new Date(order.created_at).toLocaleString("tr-TR")} · Kapıda ödeme
      </p>
      <ul className="order-items">
        {order.items.map((i) => (
          <li key={i.id}>
            <span>
              {i.quantity} × {i.name}
            </span>
            <span>{money(i.unit_price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="order-total">
        Toplam <strong>{money(order.total)}</strong>
      </div>
      {order.destination && (
        <p className="destination">
          <strong>Teslimat adresi</strong>
          <br />
          {order.destination.address}
        </p>
      )}
      {role === "courier" && active && (
        <>
          <p className="muted">
            Kesintisiz konum paylaşımı için mobil uygulamayı kullan. Tarayıcı
            yalnızca açık kaldığı sürece konum gönderebilir.
          </p>
          <button className="secondary" onClick={() => setTracking(!tracking)}>
            {tracking
              ? "Tarayıcıda konum paylaşımını durdur"
              : "Tarayıcıda konum paylaş"}
          </button>
          {geoError && <p className="error">{geoError}</p>}
        </>
      )}
      {role === "restaurant" && order.status === "picked_up" && (
        <p className="muted">
          Kurye yola çıktı. Teslimat durumunu buradan takip edebilirsin.
        </p>
      )}
      {!["delivered", "cancelled"].includes(order.status) &&
        !(role === "restaurant" && order.status === "picked_up") && (
          <details className="map-details">
            <summary>Haritada takip et</summary>
            <OrderMap order={order} />
            <div className="map-legend">
              <span>Restoran</span>
              <span>Kurye</span>
              {order.destination && <span>Teslimat adresi</span>}
            </div>
            <p className="muted">
              {order.location
                ? isLocationFresh(order.location.recorded_at, now)
                  ? "Kurye konumu güncel."
                  : "Konum güncel değil. Bağlantı bekleniyor."
                : "Kuryeden konum bekleniyor."}
            </p>
          </details>
        )}
      <div className="order-actions">
        {role === "courier" &&
          !order.courier_id &&
          order.status === "ready" && (
            <button
              disabled={busy}
              onClick={() =>
                void onAction("orders.claim", { order_id: order.id }).catch(
                  () => {},
                )
              }
            >
              Teslimatı üstlen
            </button>
          )}
        {statuses
          .filter(
            (s) =>
              canTransition(role, order.status, s) &&
              (role !== "courier" || assigned),
          )
          .map((s) => (
            <button
              disabled={busy}
              className={s === "cancelled" ? "secondary" : ""}
              key={s}
              onClick={() => void change(s)}
            >
              {s === "accepted"
                ? "Siparişi kabul et"
                : s === "preparing"
                  ? "Hazırlamaya başla"
                  : s === "ready"
                    ? "Kurye için hazır"
                    : s === "picked_up"
                      ? "Yemeği teslim aldım"
                      : s === "delivered"
                        ? "Müşteriye teslim ettim"
                        : "Siparişi iptal et"}
            </button>
          ))}
        {role === "courier" && order.destination && (
          <a className="button-link" href={navigationUrl(order.destination)}>
            Navigasyonu aç
          </a>
        )}
      </div>
      {role === "customer" &&
        order.status === "delivered" &&
        (order.reviewed ? (
          <p className="muted">Bu sipariş için puanların kaydedildi.</p>
        ) : (
          <details>
            <summary>Siparişini değerlendir</summary>
            <Form
              label="Puanları gönder"
              onSave={async (data) => {
                await onAction("reviews.create", {
                  order_id: order.id,
                  restaurant: number(data, "restaurant"),
                  service: number(data, "service"),
                  courier: number(data, "courier"),
                  items: order.items.map((i) => ({
                    order_item_id: i.id,
                    score: number(data, i.id),
                  })),
                });
              }}
            >
              {[
                ["restaurant", "Restoran"],
                ["service", "Servis"],
                ["courier", "Kurye"],
                ...order.items.map((i) => [i.id, i.name]),
              ].map(([id, label]) => (
                <label className="field" key={id}>
                  {label}
                  <select name={id} required defaultValue="">
                    <option value="" disabled>
                      Puan seç
                    </option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </Form>
          </details>
        ))}
    </article>
  );
}
