import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface VerificarQrResponse {
  paciente_id: string;
  alias: string;
  nombre_completo: string | null;
  grupo_sanguineo: string | null;
  qr_activo: boolean;
  med_access: boolean;
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
  const roles = await getRolesForUser(user.id);
  if (!roles.includes("medico")) {
    return jsonError("Solo el personal médico puede verificar códigos QR.", 403);
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug || slug.trim().length === 0) {
    return jsonError("El parámetro 'slug' es obligatorio.", 400);
  }
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const admin = createAdminServerClient();

  const { data: tokenRow, error: tokenError } = await admin
    .from("tokens_qr")
    .select("id, paciente_id, activo")
    .eq("slug", slug.trim())
    .maybeSingle();

  if (tokenError) {
    return jsonError(tokenError.message, 500, tokenError.code);
  }
  if (!tokenRow) {
    return jsonError("Código QR no encontrado.", 404);
  }
  if (!tokenRow.activo) {
    return jsonError("Este código QR está inactivo o revocado.", 410);
  }

  const { data: perfil, error: perfilError } = await admin
    .from("perfiles_paciente")
    .select("id, alias, nombre_completo, grupo_sanguineo, qr_activo, med_access")
    .eq("id", tokenRow.paciente_id)
    .maybeSingle();

  if (perfilError) {
    return jsonError(perfilError.message, 500, perfilError.code);
  }
  if (!perfil) {
    return jsonError("Perfil de paciente no encontrado.", 404);
  }
  if (!perfil.qr_activo) {
    return jsonError("El QR del paciente está desactivado.", 410);
  }
  if (!perfil.med_access) {
    return jsonError(
      "El paciente no ha autorizado el acceso a sus datos médicos.",
      403,
    );
  }

  await admin.from("logs_auditoria").insert({
    accion: "verificar_qr",
    paciente_id: perfil.id,
    usuario_id: user.id,
    detalles: { token_qr_id: tokenRow.id },
  });

  // Historial de escaneos del médico: queda registrado qué QR leyó y cuándo.
  await admin.from("escaneos_qr").insert({
    token_qr_id: tokenRow.id,
    paciente_id: perfil.id,
    usuario_id: user.id,
    rol_en_momento: "medico",
    ...(lat ? { lat: Number(lat) } : {}),
    ...(lng ? { lng: Number(lng) } : {}),
  });

  const respuesta: VerificarQrResponse = {
    paciente_id: perfil.id,
    alias: perfil.alias,
    nombre_completo: perfil.nombre_completo,
    grupo_sanguineo: perfil.grupo_sanguineo,
    qr_activo: perfil.qr_activo,
    med_access: perfil.med_access,
  };

  return jsonOk(respuesta);
}
