import { createClient, processLock } from "@courier/client";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

// Small encrypted chunks keep large sessions within native storage limits.
type Manifest = { generation: string; count: number };
async function manifest(key: string): Promise<Manifest | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  return JSON.parse(value) as Manifest;
}
async function removeChunks(key: string, entry: Manifest | null) {
  if (entry)
    await Promise.all(
      Array.from({ length: entry.count }, (_, i) =>
        SecureStore.deleteItemAsync(`${key}.${entry.generation}.${i}`),
      ),
    );
}
const storage = {
  async getItem(key: string) {
    const entry = await manifest(key);
    if (!entry) return null;
    const chunks = await Promise.all(
      Array.from({ length: entry.count }, (_, i) =>
        SecureStore.getItemAsync(`${key}.${entry.generation}.${i}`),
      ),
    );
    return chunks.some((c) => c === null) ? null : chunks.join("");
  },
  async setItem(key: string, value: string) {
    const old = await manifest(key),
      generation = Crypto.randomUUID();
    const chunks = value.match(/[\s\S]{1,400}/g) ?? [];
    await Promise.all(
      chunks.map((chunk, i) =>
        SecureStore.setItemAsync(`${key}.${generation}.${i}`, chunk),
      ),
    );
    await SecureStore.setItemAsync(
      key,
      JSON.stringify({ generation, count: chunks.length }),
    );
    await removeChunks(key, old);
  },
  async removeItem(key: string) {
    const old = await manifest(key);
    await SecureStore.deleteItemAsync(key);
    await removeChunks(key, old);
  },
};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const client =
  url && key
    ? createClient(url, key, {
        auth: {
          lock: processLock,
          storage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
