import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
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
  statusLabels,
  statuses,
  type CartItem,
  type MenuItem,
  type Order,
  type Restaurant,
  type Role,
} from "@courier/core";
import { client } from "./client";
import { startTracking, stopTracking, trackingStatus } from "./tracking";

function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: colors.ink }]}>
        {children}
      </Text>
    </Pressable>
  );
}
function Input({
  label,
  value,
  onChange,
  numeric = false,
  secure = false,
  email = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  numeric?: boolean;
  secure?: boolean;
  email?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={
          numeric
            ? "numbers-and-punctuation"
            : email
              ? "email-address"
              : "default"
        }
        autoCapitalize={secure || email ? "none" : "sentences"}
        autoCorrect={!secure && !email}
        multiline={multiline}
        style={[s.input, multiline && { minHeight: 80 }]}
      />
    </View>
  );
}
function Panel({ children }: { children: ReactNode }) {
  return <View style={s.panel}>{children}</View>;
}
type Action = (name: string, payload?: object) => Promise<Order | undefined>;

export default function App() {
  const auth = useAuth(client),
    profiles = useProfiles(client, auth.session?.user.id);
  const [role, setRole] = useState<Role | null>(null),
    [tab, setTab] = useState("home"),
    [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<Role>("customer"),
    [displayName, setDisplayName] = useState(""),
    [addProfile, setAddProfile] = useState(false);
  const profile = profiles.profiles.find((p) => p.role === role);
  const workspace = useWorkspace(
    client,
    auth.session?.user.id,
    role,
    Boolean(profile?.approved),
  );
  useEffect(() => {
    if (!auth.session || !profiles.profiles.length || role) return;
    let active = true;
    void SecureStore.getItemAsync(`role-${auth.session.user.id}`).then(
      (saved) => {
        if (active)
          setRole(
            profiles.profiles.find((p) => p.role === saved)?.role ??
              profiles.profiles[0]!.role,
          );
      },
    );
    return () => {
      active = false;
    };
  }, [auth.session, profiles.profiles, role]);
  useEffect(() => {
    if (!auth.loading && !auth.session) {
      setRole(null);
      void stopTracking().catch(() => {});
    }
  }, [auth.loading, auth.session]);
  useEffect(() => {
    if (!client) return;
    if (AppState.currentState === "active") client.auth.startAutoRefresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        client!.auth.startAutoRefresh();
        void workspace.refresh();
        void profiles.refresh();
      } else client!.auth.stopAutoRefresh();
    });
    return () => {
      listener.remove();
      client!.auth.stopAutoRefresh();
    };
  }, [workspace.refresh, profiles.refresh]);
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert("İşlem tamamlanamadı", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const action: Action = async (name, payload = {}) => {
    if (!client || !role) return;
    const result = await call<Order>(client, name, { role, ...payload });
    await workspace.refresh();
    return result;
  };
  async function selectRole(next: Role) {
    await stopTracking();
    if (auth.session)
      await SecureStore.setItemAsync(`role-${auth.session.user.id}`, next);
    setRole(next);
    setTab("home");
    setAddProfile(false);
  }
  const refresh = async () => {
    await Promise.all([workspace.refresh(), profiles.refresh()]);
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={s.fill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Text style={s.brand}>
              courier<Text style={{ color: colors.accent }}>.</Text>
            </Text>
            {auth.session && (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void perform(async () => {
                    await stopTracking();
                    const { error } = await client!.auth.signOut();
                    if (error) throw error;
                  })
                }
              >
                <Text style={s.muted}>Çıkış yap</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              auth.session ? (
                <RefreshControl
                  refreshing={false}
                  onRefresh={() => void refresh()}
                />
              ) : undefined
            }
          >
            {!auth.session ? (
              <>
                <View style={s.intro}>
                  <Text style={s.hero}>Yemeğin{"\n"}yola çıksın.</Text>
                  <Text style={s.introText}>
                    Mahallendeki mutfaklardan kapına. Her adımda yanında.
                  </Text>
                </View>
                {!client && (
                  <Text style={s.notice}>
                    Bağlantı henüz kurulmadı. Kurulum adımları proje içindeki
                    docs/KURULUM.md dosyasında.
                  </Text>
                )}
                {auth.error && <Text style={s.notice}>{auth.error}</Text>}
                <AuthScreen disabled={!client || auth.loading} />
              </>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.roleRow}
                >
                  {profiles.profiles.map((p) => (
                    <Button
                      key={p.id}
                      secondary={role !== p.role}
                      disabled={busy}
                      onPress={() => void perform(() => selectRole(p.role))}
                    >
                      {roleLabels[p.role]}
                    </Button>
                  ))}
                </ScrollView>
                <Text style={s.title}>
                  {role === "customer"
                    ? "Bugün ne yesek?"
                    : role === "restaurant"
                      ? "Mutfakta neler oluyor?"
                      : role === "courier"
                        ? "Sıradaki teslimatın."
                        : "Profilini oluştur."}
                </Text>
                {(workspace.error || profiles.error) && (
                  <Text style={s.notice}>
                    {workspace.error || profiles.error}
                  </Text>
                )}
                {profile && !profile.approved && (
                  <Panel>
                    <Text style={s.h2}>Başvurun alındı</Text>
                    <Text style={s.muted}>
                      Restoran ve kurye profilleri onaylandıktan sonra işlem
                      yapabilir.
                    </Text>
                    <Button secondary onPress={() => void profiles.refresh()}>
                      Onay durumunu kontrol et
                    </Button>
                  </Panel>
                )}
                {profile?.approved && (
                  <>
                    <View style={s.roleRow}>
                      <Button
                        secondary={tab !== "home"}
                        onPress={() => setTab("home")}
                      >
                        {role === "customer" ? "Restoranlar" : "Siparişler"}
                      </Button>
                      {role === "customer" && (
                        <Button
                          secondary={tab !== "orders"}
                          onPress={() => setTab("orders")}
                        >
                          Siparişlerim
                        </Button>
                      )}
                      {role === "restaurant" && (
                        <Button
                          secondary={tab !== "manage"}
                          onPress={() => setTab("manage")}
                        >
                          Menüyü yönet
                        </Button>
                      )}
                    </View>
                    <Text style={s.connection}>
                      {workspace.connected
                        ? "Güncellemeler bağlı"
                        : "Bağlantı bekleniyor"}
                    </Text>
                    {role === "customer" && tab === "home" ? (
                      <CustomerCatalog
                        key={profile.id}
                        restaurants={workspace.restaurants}
                        menu={workspace.menu}
                        onOrder={async (payload) => {
                          await action("orders.create", payload);
                          setTab("orders");
                        }}
                      />
                    ) : role === "restaurant" && tab === "manage" ? (
                      <RestaurantEditor
                        key={profile.id}
                        restaurant={workspace.restaurants.find(
                          (r) => r.id === profile.id,
                        )}
                        menu={workspace.menu.filter(
                          (m) => m.restaurant_id === profile.id,
                        )}
                        action={action}
                      />
                    ) : (
                      <>
                        {!workspace.orders.length && (
                          <Panel>
                            <Text style={s.h2}>Henüz sipariş yok.</Text>
                            <Text style={s.muted}>
                              Yeni siparişler burada görünecek. Listeyi
                              yenilemek için aşağı çek.
                            </Text>
                          </Panel>
                        )}
                        {workspace.orders.map((order) => (
                          <MobileOrder
                            key={order.id}
                            order={order}
                            role={role!}
                            profileId={profile.id}
                            action={action}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
                {profiles.profiles.length < 3 && (
                  <Panel>
                    <Button
                      secondary
                      onPress={() => {
                        setAddProfile(!addProfile);
                        setNewRole(
                          roles.find(
                            (r) => !profiles.profiles.some((p) => p.role === r),
                          ) ?? "customer",
                        );
                      }}
                    >
                      Başka bir profil oluştur
                    </Button>
                    {(addProfile || !profiles.profiles.length) && (
                      <>
                        <Input
                          label="Görünen adın"
                          value={displayName}
                          onChange={setDisplayName}
                        />
                        <View style={s.roleRow}>
                          {roles
                            .filter(
                              (r) =>
                                !profiles.profiles.some((p) => p.role === r),
                            )
                            .map((r) => (
                              <Button
                                key={r}
                                secondary={newRole !== r}
                                onPress={() => setNewRole(r)}
                              >
                                {roleLabels[r]}
                              </Button>
                            ))}
                        </View>
                        <Button
                          disabled={busy}
                          onPress={() =>
                            void perform(async () => {
                              await call(client!, "profiles.create", {
                                role: newRole,
                                display_name: displayName.trim(),
                              });
                              await profiles.refresh();
                              await selectRole(newRole);
                            })
                          }
                        >
                          Profili oluştur
                        </Button>
                      </>
                    )}
                  </Panel>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function AuthScreen({ disabled }: { disabled: boolean }) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(reset = false) {
    if (!client) return;
    setBusy(true);
    try {
      if (!reset && password.length < 8)
        throw new Error("Şifren en az 8 karakter olmalı.");
      const credentials = { email: email.trim().toLowerCase(), password },
        redirect = process.env.EXPO_PUBLIC_WEB_URL;
      const result = reset
        ? await client.auth.resetPasswordForEmail(credentials.email, {
            redirectTo: redirect,
          })
        : mode === "register"
          ? await client.auth.signUp({
              ...credentials,
              options: { emailRedirectTo: redirect },
            })
          : await client.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (reset || mode === "register")
        Alert.alert(
          "E-postanı kontrol et",
          "Adresin uygunsa bir bağlantı gönderildi. Tarayıcıda doğruladıktan sonra uygulamaya dönüp giriş yap.",
        );
    } catch (e) {
      Alert.alert("Giriş tamamlanamadı", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <Text style={s.h2}>Hoş geldin</Text>
      <View style={s.roleRow}>
        <Button secondary={mode !== "login"} onPress={() => setMode("login")}>
          Giriş yap
        </Button>
        <Button
          secondary={mode !== "register"}
          onPress={() => setMode("register")}
        >
          Kayıt ol
        </Button>
      </View>
      <Input label="E-posta adresin" value={email} onChange={setEmail} email />
      <Input label="Şifren" value={password} onChange={setPassword} secure />
      <Button disabled={disabled || busy} onPress={() => void submit()}>
        {busy ? "İşleniyor…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
      </Button>
      <Button
        secondary
        disabled={disabled || busy}
        onPress={() => void submit(true)}
      >
        Şifremi unuttum
      </Button>
    </Panel>
  );
}
function CustomerCatalog({
  restaurants,
  menu,
  onOrder,
}: {
  restaurants: Restaurant[];
  menu: MenuItem[];
  onOrder: (payload: object) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [cart, setCart] = useState<CartItem[]>([]),
    [search, setSearch] = useState("");
  const [address, setAddress] = useState(""),
    [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState("");
  const [requestId, setRequestId] = useState(Crypto.randomUUID()),
    [busy, setBusy] = useState(false);
  const restaurant = restaurants.find((r) => r.id === selected);
  const subtotal = cart.reduce(
    (sum, c) =>
      sum +
      (menu.find((m) => m.id === c.menu_item_id)?.price ?? 0) * c.quantity,
    0,
  );
  function change(id: string, delta: number) {
    setRequestId(Crypto.randomUUID());
    setCart((old) => {
      const next = old.map((i) => ({ ...i })),
        existing = next.find((i) => i.menu_item_id === id);
      if (existing) existing.quantity = Math.min(20, existing.quantity + delta);
      else if (delta > 0) next.push({ menu_item_id: id, quantity: 1 });
      return next.filter((i) => i.quantity > 0);
    });
  }
  async function locate() {
    setBusy(true);
    try {
      if (
        (await Location.requestForegroundPermissionsAsync()).status !==
        "granted"
      )
        throw new Error("Konum iznini açmalısın.");
      const p = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(String(p.coords.latitude));
      setLongitude(String(p.coords.longitude));
    } catch (e) {
      Alert.alert("Konum alınamadı", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Input label="Restoran ara" value={search} onChange={setSearch} />
      {!restaurants.length && (
        <Panel>
          <Text style={s.h2}>İlk mutfaklar hazırlanıyor.</Text>
          <Text style={s.muted}>
            Siparişe açık restoranlar burada listelenecek.
          </Text>
        </Panel>
      )}
      {restaurants
        .filter((r) =>
          r.name
            .toLocaleLowerCase("tr")
            .includes(search.toLocaleLowerCase("tr")),
        )
        .map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => {
              setSelected(r.id);
              setCart([]);
              setRequestId(Crypto.randomUUID());
            }}
            style={[
              s.panel,
              selected === r.id && { borderColor: colors.accent },
            ]}
          >
            <Text style={s.h2}>{r.name}</Text>
            <Text style={s.muted}>{r.description || r.address}</Text>
            <Text style={s.small}>
              {r.is_open ? "Siparişe açık" : "Kapalı"} · Min.{" "}
              {money(r.minimum_order)} · Teslimat {money(r.delivery_fee)}
            </Text>
          </Pressable>
        ))}
      {restaurant && (
        <>
          <Text style={s.h2}>{restaurant.name} menüsü</Text>
          {menu
            .filter((m) => m.restaurant_id === selected && m.available)
            .map((m) => (
              <Panel key={m.id}>
                <Text style={s.h3}>{m.name}</Text>
                <Text style={s.muted}>{m.description}</Text>
                <View style={s.between}>
                  <Text style={s.h3}>{money(m.price)}</Text>
                  <Button
                    secondary
                    disabled={!restaurant.is_open}
                    onPress={() => change(m.id, 1)}
                  >
                    Sepete ekle
                  </Button>
                </View>
              </Panel>
            ))}
        </>
      )}
      {!!cart.length && (
        <Panel>
          <Text style={s.h2}>Sepetin</Text>
          {cart.map((c) => (
            <View key={c.menu_item_id} style={s.cartLine}>
              <Text style={s.body}>
                {menu.find((m) => m.id === c.menu_item_id)?.name}
              </Text>
              <View style={s.roleRow}>
                <Button secondary onPress={() => change(c.menu_item_id, -1)}>
                  −
                </Button>
                <Text style={s.quantity}>{c.quantity}</Text>
                <Button secondary onPress={() => change(c.menu_item_id, 1)}>
                  +
                </Button>
              </View>
            </View>
          ))}
          <Text style={s.h2}>
            Toplam {money(subtotal + (restaurant?.delivery_fee ?? 0))}
          </Text>
          <Text style={s.small}>Teslimat ücreti dahil. Ödeme kapıda.</Text>
          <Input
            label="Açık adres, bina ve daire"
            value={address}
            onChange={setAddress}
            multiline
          />
          <Button secondary disabled={busy} onPress={() => void locate()}>
            Bulunduğum konumu al
          </Button>
          <Input
            label="Teslimat enlemi"
            value={latitude}
            onChange={setLatitude}
            numeric
          />
          <Input
            label="Teslimat boylamı"
            value={longitude}
            onChange={setLongitude}
            numeric
          />
          <Text style={s.small}>
            Konumunun teslimat adresine ait olduğunu kontrol et.
          </Text>
          <Button
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void onOrder({
                restaurant_id: selected,
                items: cart,
                address: address.trim(),
                latitude: latitude.trim()
                  ? Number(latitude.replace(",", "."))
                  : null,
                longitude: longitude.trim()
                  ? Number(longitude.replace(",", "."))
                  : null,
                request_id: requestId,
              })
                .then(() => {
                  setCart([]);
                  setRequestId(Crypto.randomUUID());
                })
                .catch((e) =>
                  Alert.alert("Sipariş oluşturulamadı", errorMessage(e)),
                )
                .finally(() => setBusy(false));
            }}
          >
            Kapıda ödemeyle sipariş ver
          </Button>
        </Panel>
      )}
    </>
  );
}
function RestaurantEditor({
  restaurant,
  menu,
  action,
}: {
  restaurant?: Restaurant;
  menu: MenuItem[];
  action: Action;
}) {
  const [name, setName] = useState(restaurant?.name ?? ""),
    [description, setDescription] = useState(restaurant?.description ?? ""),
    [address, setAddress] = useState(restaurant?.address ?? "");
  const [lat, setLat] = useState(String(restaurant?.latitude ?? "")),
    [lng, setLng] = useState(String(restaurant?.longitude ?? "")),
    [fee, setFee] = useState(String((restaurant?.delivery_fee ?? 0) / 100)),
    [minimum, setMinimum] = useState(
      String((restaurant?.minimum_order ?? 0) / 100),
    ),
    [open, setOpen] = useState(restaurant?.is_open ?? false);
  const [editing, setEditing] = useState<MenuItem | null>(null),
    [itemName, setItemName] = useState(""),
    [itemDescription, setItemDescription] = useState(""),
    [price, setPrice] = useState(""),
    [available, setAvailable] = useState(true),
    [busy, setBusy] = useState(false);
  const numeric = (value: string) =>
    value.trim() ? Number(value.replace(",", ".")) : null;
  function edit(item: MenuItem | null) {
    setEditing(item);
    setItemName(item?.name ?? "");
    setItemDescription(item?.description ?? "");
    setPrice(item ? String(item.price / 100) : "");
    setAvailable(item?.available ?? true);
  }
  async function save(actionName: string, payload: object) {
    setBusy(true);
    try {
      await action(actionName, payload);
      Alert.alert("Kaydedildi", "Bilgiler güncellendi.");
    } catch (e) {
      Alert.alert("Kaydedilemedi", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel>
        <Text style={s.h2}>Restoran bilgileri</Text>
        <Input label="Restoran adı" value={name} onChange={setName} />
        <Input
          label="Kısa açıklama"
          value={description}
          onChange={setDescription}
        />
        <Input label="Restoran adresi" value={address} onChange={setAddress} />
        <Input label="Enlem" value={lat} onChange={setLat} numeric />
        <Input label="Boylam" value={lng} onChange={setLng} numeric />
        <Input
          label="Teslimat ücreti (TL)"
          value={fee}
          onChange={setFee}
          numeric
        />
        <Input
          label="Minimum sipariş (TL)"
          value={minimum}
          onChange={setMinimum}
          numeric
        />
        <View style={s.between}>
          <Text>Sipariş almaya açık</Text>
          <Switch value={open} onValueChange={setOpen} />
        </View>
        <Button
          disabled={busy}
          onPress={() =>
            void save("restaurant.save", {
              name: name.trim(),
              description,
              address: address.trim(),
              latitude: numeric(lat),
              longitude: numeric(lng),
              delivery_fee: Math.round(Number(numeric(fee)) * 100),
              minimum_order: Math.round(Number(numeric(minimum)) * 100),
              is_open: open,
            })
          }
        >
          Restoranı kaydet
        </Button>
      </Panel>
      {restaurant && (
        <Panel>
          <Text style={s.h2}>
            {editing ? "Yemeği düzenle" : "Menüye yemek ekle"}
          </Text>
          <Input label="Yemek adı" value={itemName} onChange={setItemName} />
          <Input
            label="İçindekiler ve açıklama"
            value={itemDescription}
            onChange={setItemDescription}
          />
          <Input label="Fiyat (TL)" value={price} onChange={setPrice} numeric />
          <View style={s.between}>
            <Text>Satışta</Text>
            <Switch value={available} onValueChange={setAvailable} />
          </View>
          <Button
            disabled={busy}
            onPress={() =>
              void save("menu.save", {
                id: editing?.id,
                name: itemName.trim(),
                description: itemDescription,
                price: Math.round(Number(numeric(price)) * 100),
                available,
              })
            }
          >
            Yemeği kaydet
          </Button>
          {editing && (
            <Button secondary onPress={() => edit(null)}>
              Yeni yemek ekle
            </Button>
          )}
          {menu.map((item) => (
            <View key={item.id} style={s.cartLine}>
              <Text style={s.h3}>
                {item.name} · {money(item.price)}
              </Text>
              <Text style={s.small}>
                {item.available ? "Satışta" : "Tükendi"}
              </Text>
              <Button secondary onPress={() => edit(item)}>
                Düzenle
              </Button>
            </View>
          ))}
        </Panel>
      )}
    </>
  );
}
function MobileOrder({
  order,
  role,
  profileId,
  action,
}: {
  order: Order;
  role: Role;
  profileId: string;
  action: Action;
}) {
  const [busy, setBusy] = useState(false),
    [showMap, setShowMap] = useState(false),
    [now, setNow] = useState(Date.now()),
    [tracking, setTracking] = useState(false),
    [trackingError, setTrackingError] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({}),
    [reviewing, setReviewing] = useState(false);
  const assigned = order.courier_id === profileId,
    active = assigned && ["ready", "picked_up"].includes(order.status);
  useEffect(() => {
    let alive = true;
    async function update() {
      setNow(Date.now());
      if (role === "courier") {
        const state = await trackingStatus();
        if (!active && state.orderId === order.id) await stopTracking();
        if (alive) {
          setTracking(active && state.orderId === order.id);
          setTrackingError(
            state.orderId === order.id ? (state.error ?? "") : "",
          );
        }
      }
    }
    void update().catch(() => {});
    const timer = setInterval(() => void update().catch(() => {}), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [order.id, active, role]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert("İşlem tamamlanamadı", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function transition(status: string) {
    if (status === "picked_up") await startTracking(order.id);
    const updated = await action("orders.transition", {
      order_id: order.id,
      status,
    });
    if (status === "delivered") await stopTracking();
    if (status === "picked_up" && updated?.destination) {
      try {
        await Linking.openURL(navigationUrl(updated.destination));
      } catch {
        Alert.alert(
          "Navigasyon açılamadı",
          "Siparişten Navigasyonu aç düğmesini tekrar dene.",
        );
      }
    }
  }
  return (
    <Panel>
      <Text style={s.small}>
        Sipariş #{order.id.slice(0, 8)} ·{" "}
        {new Date(order.created_at).toLocaleString("tr-TR")}
      </Text>
      <Text style={s.h2}>{order.restaurant.name}</Text>
      <Text style={s.status}>{statusLabels[order.status]}</Text>
      {order.items.map((i) => (
        <View style={s.between} key={i.id}>
          <Text style={s.body}>
            {i.quantity} × {i.name}
          </Text>
          <Text>{money(i.unit_price * i.quantity)}</Text>
        </View>
      ))}
      <Text style={s.h3}>Toplam {money(order.total)} · Kapıda ödeme</Text>
      {order.destination && (
        <Text style={s.notice}>
          Teslimat adresi: {order.destination.address}
        </Text>
      )}
      {role === "courier" && active && (
        <>
          <Text style={s.small}>
            Konumun yalnızca bu teslimatın müşteri ve restoranıyla paylaşılır.
          </Text>
          <Button
            disabled={busy}
            secondary
            onPress={() =>
              void run(async () => {
                if (tracking) await stopTracking();
                else await startTracking(order.id);
                setTracking(!tracking);
              })
            }
          >
            {tracking ? "Konum paylaşımını durdur" : "Konum paylaşımını başlat"}
          </Button>
          {trackingError && <Text style={s.notice}>{trackingError}</Text>}
        </>
      )}
      {!["delivered", "cancelled"].includes(order.status) && (
        <>
          <Button secondary onPress={() => setShowMap(!showMap)}>
            {showMap ? "Haritayı kapat" : "Haritada takip et"}
          </Button>
          {showMap && (
            <MapView
              style={s.map}
              initialRegion={{
                latitude: order.restaurant.latitude,
                longitude: order.restaurant.longitude,
                latitudeDelta: 0.07,
                longitudeDelta: 0.07,
              }}
            >
              <Marker
                coordinate={{
                  latitude: order.restaurant.latitude,
                  longitude: order.restaurant.longitude,
                }}
                title="Restoran"
                pinColor={colors.accent}
              />
              {order.destination && (
                <Marker
                  coordinate={order.destination}
                  title="Teslimat adresi"
                  pinColor="#315ca8"
                />
              )}
              {order.location && (
                <Marker
                  coordinate={order.location}
                  title="Kurye"
                  pinColor={colors.green}
                />
              )}
            </MapView>
          )}
          <Text style={s.small}>
            {role === "restaurant" && order.status === "picked_up"
              ? "Kurye yola çıktı. Restoran için konum paylaşımı tamamlandı."
              : order.location
                ? isLocationFresh(order.location.recorded_at, now)
                  ? "Kurye konumu güncel."
                  : "Konum güncel değil. Bağlantı bekleniyor."
                : "Kuryeden konum bekleniyor."}
          </Text>
        </>
      )}
      {role === "courier" && !order.courier_id && order.status === "ready" && (
        <Button
          disabled={busy}
          onPress={() =>
            void run(() => action("orders.claim", { order_id: order.id }))
          }
        >
          Teslimatı üstlen
        </Button>
      )}
      {statuses
        .filter(
          (status) =>
            canTransition(role, order.status, status) &&
            (role !== "courier" || assigned),
        )
        .map((status) => (
          <Button
            key={status}
            disabled={busy}
            secondary={status === "cancelled"}
            onPress={() => {
              if (status === "delivered")
                Alert.alert(
                  "Teslimatı tamamla",
                  "Yemeği müşteriye teslim edip kapıda ödemeyi aldın mı?",
                  [
                    { text: "Vazgeç", style: "cancel" },
                    {
                      text: "Teslim ettim",
                      onPress: () => void run(() => transition(status)),
                    },
                  ],
                );
              else void run(() => transition(status));
            }}
          >
            {status === "accepted"
              ? "Siparişi kabul et"
              : status === "preparing"
                ? "Hazırlamaya başla"
                : status === "ready"
                  ? "Kurye için hazır"
                  : status === "picked_up"
                    ? "Yemeği teslim aldım"
                    : status === "delivered"
                      ? "Müşteriye teslim ettim"
                      : "Siparişi iptal et"}
          </Button>
        ))}
      {role === "courier" && order.destination && (
        <Button
          secondary
          onPress={() =>
            void run(() => Linking.openURL(navigationUrl(order.destination!)))
          }
        >
          Navigasyonu aç
        </Button>
      )}
      {role === "customer" &&
        order.status === "delivered" &&
        (order.reviewed ? (
          <Text style={s.small}>Puanların kaydedildi.</Text>
        ) : (
          <>
            <Button secondary onPress={() => setReviewing(!reviewing)}>
              Siparişini değerlendir
            </Button>
            {reviewing && (
              <>
                {[
                  ["restaurant", "Restoran"],
                  ["service", "Servis"],
                  ["courier", "Kurye"],
                  ...order.items.map((i) => [i.id, i.name]),
                ].map(([id, label]) => (
                  <View key={id} style={s.field}>
                    <Text style={s.label}>{label}</Text>
                    <View style={s.roleRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Pressable
                          key={n}
                          accessibilityRole="radio"
                          accessibilityLabel={`${label}: ${n} puan`}
                          accessibilityState={{ selected: scores[id!] === n }}
                          onPress={() => setScores((v) => ({ ...v, [id!]: n }))}
                          style={[
                            s.score,
                            scores[id!] === n && {
                              backgroundColor: colors.accent,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: scores[id!] === n ? "#fff" : colors.ink,
                            }}
                          >
                            {n}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
                <Button
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      action("reviews.create", {
                        order_id: order.id,
                        restaurant: scores.restaurant,
                        service: scores.service,
                        courier: scores.courier,
                        items: order.items.map((i) => ({
                          order_item_id: i.id,
                          score: scores[i.id],
                        })),
                      }),
                    )
                  }
                >
                  Puanları gönder
                </Button>
              </>
            )}
          </>
        ))}
    </Panel>
  );
}
const colors = {
  ink: "#202820",
  muted: "#647064",
  accent: "#b73525",
  green: "#176348",
  line: "#dce2d9",
  surface: "#f7f8f6",
};
const s = StyleSheet.create({
  fill: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    height: 70,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  brand: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -2,
    color: colors.ink,
  },
  content: { padding: 20, gap: 18, paddingBottom: 50 },
  intro: { backgroundColor: "#efeadf", borderRadius: 22, padding: 28, gap: 18 },
  hero: {
    fontSize: 49,
    lineHeight: 51,
    fontWeight: "800",
    letterSpacing: -2,
    color: colors.ink,
  },
  introText: { fontSize: 16, lineHeight: 25, color: colors.ink },
  panel: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.ink,
    marginTop: 10,
  },
  h2: { fontSize: 22, fontWeight: "700", color: colors.ink },
  h3: { fontSize: 16, fontWeight: "600", color: colors.ink },
  body: { fontSize: 15, color: colors.ink, flexShrink: 1 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 22 },
  small: { fontSize: 12, color: colors.muted, lineHeight: 19 },
  button: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "500", color: colors.ink },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c4cec1",
    borderRadius: 9,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: "#fff",
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  notice: {
    padding: 14,
    backgroundColor: "#edf2ea",
    color: "#354932",
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 22,
  },
  connection: { fontSize: 12, color: colors.muted },
  quantity: { padding: 10, fontWeight: "700" },
  cartLine: {
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  status: {
    alignSelf: "flex-start",
    backgroundColor: "#edf2ea",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    color: colors.green,
    fontSize: 13,
  },
  map: { height: 270, borderRadius: 12 },
  score: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
