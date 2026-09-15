import {
  getBearerToken,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { generateQrSlug } from "@/lib/qr/slug";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 6;

interface TokenQrRowInsert {
  activo: boolean;
  paciente_id: string;
  slug: string;
  url_publica: string;
}

export async function GET(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const admin = createAdminServerClient();
  const { data: perfil, error: perfilError } = await admin
    .from("perfiles_paciente")
    .select("alias,fecha_nacimiento,genero,grupo_sanguineo,id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (perfilError) {
    return jsonError(perfilError.message, 500);
  }
  if (!perfil) {
    return jsonError(
      "Perfil de paciente no encontrado. Completá tu perfil de paciente para activar tu QR.",
      404,
    );
  }

  // Obligatorios "de verdad": sin estos campos el QR no se puede activar.
  const tieneCompletos =
    typeof perfil.alias === "string" &&
    perfil.alias.trim().length >= 2 &&
    Boolean(perfil.fecha_nacimiento) &&
    Boolean(perfil.genero) &&
    Boolean(perfil.grupo_sanguineo);
  if (!tieneCompletos) {
    return jsonError(
      "Completá antes los campos obligatorios: alias, fecha de nacimiento, género y grupo sanguíneo.",
      400,
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let slug: string | null = null;
  let urlPublica = "";

  for (let i = 0; i < MAX_ATTEMPTS && !slug; i++) {
    const candidate = generateQrSlug(12);
    urlPublica = `${siteUrl}/e/${candidate}`;
    const row: TokenQrRowInsert = {
      activo: true,
      paciente_id: perfil.id,
      slug: candidate,
      url_publica: urlPublica,
    };
    const { error } = await admin.from("tokens_qr").insert(row);
    if (!error) {
      slug = candidate;
    } else if (error.code !== "23505") {
      return jsonError(error.message, 500, error.code);
    }
  }

  if (!slug) {
    return jsonError("No se pudo generar un slug único. Intentá de nuevo.", 500);
  }

  // Revocar tokens anteriores y dejar activo el nuevo.
  const { error: revokeError } = await admin
    .from("tokens_qr")
    .update({ activo: false, revocado_en: new Date().toISOString() })
    .eq("paciente_id", perfil.id)
    .eq("activo", true)
    .neq("slug", slug);
  if (revokeError) {
    return jsonError(revokeError.message, 500);
  }

  const { error: updateError } = await admin
    .from("perfiles_paciente")
    .update({ qr_activo: true, slug_qr: slug })
    .eq("id", perfil.id);
  if (updateError) {
    return jsonError(updateError.message, 500);
  }

  return jsonOk({
    message: "QR generado correctamente.",
    qr_activo: true,
    slug,
    url_publica: urlPublica,
  });
}