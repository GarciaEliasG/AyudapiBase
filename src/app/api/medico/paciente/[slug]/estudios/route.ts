import type { EstudioConAcceso } from "@/lib/supabase/database";

import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "estudios";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const token = getBearerToken(_req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }
  const roles = await getRolesForUser(user.id);
  if (!roles.includes("medico")) {
    return jsonError("Solo el personal médico puede acceder a estudios.", 403);
  }

  if (!slug || slug.trim().length === 0) {
    return jsonError("El slug del paciente es obligatorio.", 400);
  }

  const admin = createAdminServerClient();

  const { data: tokenRow, error: tokenError } = await admin
    .from("tokens_qr")
    .select("paciente_id, activo")
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
    .select("id, qr_activo, med_access")
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

  const { data: filas, error } = await admin
    .from("estudios")
    .select("*")
    .eq("paciente_id", perfil.id)
    .order("creado_en", { ascending: false });

  if (error) {
    return jsonError(error.message, 500, error.code);
  }

  const estudios: EstudioConAcceso[] = await Promise.all(
    (filas ?? []).map(async (fila) => {
      const { data: firmado } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(fila.ruta_archivo, 300);
      return { ...fila, url_acceso: firmado?.signedUrl ?? null } as EstudioConAcceso;
    }),
  );

  await admin.from("logs_auditoria").insert({
    accion: "acceso_estudios",
    paciente_id: perfil.id,
    usuario_id: user.id,
    detalles: { slug, cantidad: estudios.length },
  });

  return jsonOk({ estudios });
}
