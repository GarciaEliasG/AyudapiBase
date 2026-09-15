import { parseJsonBody } from "@/lib/api/http";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAnonServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface GoogleAuthRequest {
  redirectTo?: string;
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody<GoogleAuthRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectTo = parsed.data.redirectTo ?? `${siteUrl}/auth/callback`;

  const { data, error } = await createAnonServerClient().auth.signInWithOAuth({
    options: { redirectTo },
    provider: "google",
  });

  if (error) {
    return jsonError("No se pudo iniciar la autenticación con Google.", 400, error.message);
  }

  return jsonOk({ message: "Redirigiendo a Google.", url: data.url });
}