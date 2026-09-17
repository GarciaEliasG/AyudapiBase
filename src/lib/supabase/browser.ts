/**
 * Cliente Supabase de navegador (singleton).
 *
 * Nota de seguridad / persistencia: `@supabase/ssr` gestiona la sesión vía
 * cookies (sincronizadas con el middleware y los Server Components) e ignora
 * la opción `auth.storage`, por lo que NO se le inyecta `sessionStorage` aquí:
 * hacerlo no tendría efecto y rompería el SSR. La política "cerrar la
 * pestaña/navegador destruye la sesión" se aplica en
 * `@/lib/auth/persistencia-sesion` + `@/lib/auth/use-session`: cada pestaña
 * nueva sin marcador destruye la sesión heredada con `signOut()`.
 */

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