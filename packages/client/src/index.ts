import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { MenuItem, Order, Profile, Restaurant, Role } from "@courier/core";
export { createClient, processLock } from "@supabase/supabase-js";
export type { SupabaseClient } from "@supabase/supabase-js";

export function errorMessage(error: unknown): string {
  const source = error as { message?: string; code?: string };
  if (source?.code === "23505")
    return "Bu kayıt zaten var. Aynı profili, siparişi veya puanı tekrar oluşturamazsın.";
  if (
    source?.code === "23514" ||
    source?.code === "23502" ||
    source?.code === "22P02"
  )
    return "Bilgileri kontrol et. Zorunlu alanlar ve sayısal değerler geçerli olmalı.";
  const message =
    source?.message ??
    "İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.";
  if (/Invalid login credentials/i.test(message))
    return "E-posta veya şifre hatalı.";
  if (/Email not confirmed/i.test(message))
    return "Giriş yapmadan önce e-postanı doğrula.";
  if (/Failed to fetch|Network request failed/i.test(message))
    return "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.";
  return message;
}
export async function call<T>(
  client: SupabaseClient,
  action: string,
  payload: object = {},
): Promise<T> {
  const { data, error } = await client.rpc("app", {
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  return data as T;
}
export function useAuth(client: SupabaseClient | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(errorMessage(error));
        setSession(data.session);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);
  return { session, loading, error };
}
export function useProfiles(
  client: SupabaseClient | null,
  userId: string | undefined,
) {
  const [data, setData] = useState<{ userId?: string; profiles: Profile[] }>({
    profiles: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!client || !userId) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const profiles = await call<Profile[]>(client, "profiles.list");
      if (request === generation.current) {
        setData({ userId, profiles });
        setError("");
      }
    } catch (e) {
      if (request === generation.current) setError(errorMessage(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [client, userId]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  return {
    profiles: data.userId === userId ? data.profiles : [],
    loading,
    error,
    refresh,
  };
}
type Workspace = {
  orders: Order[];
  restaurants: Restaurant[];
  menu: MenuItem[];
};
const empty: Workspace = { orders: [], restaurants: [], menu: [] };
export function useWorkspace(
  client: SupabaseClient | null,
  userId: string | undefined,
  role: Role | null,
  enabled: boolean,
) {
  const key = `${userId}:${role}:${enabled}`;
  const [data, setData] = useState<Workspace & { key: string }>({
    ...empty,
    key: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!client || !userId || !role || !enabled) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const [orders, catalog] = await Promise.all([
        call<Order[]>(client, "orders.list", { role }),
        call<Pick<Workspace, "restaurants" | "menu">>(client, "catalog", {
          role,
        }),
      ]);
      if (request === generation.current) {
        setData({ orders, ...catalog, key });
        setError("");
      }
    } catch (e) {
      if (request === generation.current) setError(errorMessage(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [client, userId, role, enabled, key]);
  useEffect(() => {
    setConnected(false);
    setError("");
    if (!client || !userId || !role || !enabled) return;
    let alive = true;
    void refresh();
    const channel = client
      .channel(`orders:${userId}:${role}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_events" },
        () => {
          void refresh();
        },
      )
      .subscribe((status) => {
        if (alive) {
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") void refresh();
        }
      });
    // Reconcile missed events and discover newly available courier jobs.
    const interval = setInterval(() => {
      void refresh();
    }, 15_000);
    return () => {
      alive = false;
      generation.current++;
      clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [client, userId, role, enabled, refresh]);
  return {
    ...(data.key === key ? data : empty),
    error,
    loading,
    connected,
    refresh,
  };
}
