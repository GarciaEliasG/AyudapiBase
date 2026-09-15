import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

let browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.");
  }
  browserClient = createSsrBrowserClient(url, anonKey);
  return browserClient;
}