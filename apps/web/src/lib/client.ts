"use client";
import { createClient } from "@courier/client";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const client = url && key ? createClient(url, key) : null;
