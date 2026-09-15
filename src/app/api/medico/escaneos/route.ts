import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface EscaneoReciente {
  creado_en: string;
  paciente_id: string;
  alias: string;
  nombre_completo: string | null;
  grupo_sanguineo: string | null;
  slug: string | null;
  disponible: boolean;
}

const LIMITE = 30;

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
    return jsonError(
      "Solo el personal médico puede consultar su historial de escaneos.",
      403,
    );
  }

  const admin = createAdminServerClient();
  const { data: filas, error } = await admin
    .from("escaneos_qr")
    .select(
      "creado_en, perfiles_paciente(id, alias, nombre_completo, grupo_sanguineo, slug_qr, qr_activo, med_access)",
    )
    .eq("usuario_id", user.id)
    .order("creado_en", { ascending: false })
    .limit(LIMITE);

  if (error) {
    return jsonError(error.message, 500, error.code);
  }

  const escaneos: EscaneoReciente[] = (filas ?? []).flatMap((fila) => {
    const perfil = Array.isArray(fila.perfiles_paciente)
      ? fila.perfiles_paciente[0]
      : fila.perfiles_paciente;
    if (!perfil) return [];
    return [
      {
        creado_en: fila.creado_en as string,
        paciente_id: perfil.id as string,
        alias: perfil.alias as string,
        nombre_completo: (perfil.nombre_completo as string | null) ?? null,
        grupo_sanguineo: (perfil.grupo_sanguineo as string | null) ?? null,
        slug: (perfil.slug_qr as string | null) ?? null,
        disponible: Boolean(perfil.qr_activo && perfil.med_access && perfil.slug_qr),
      },
    ];
  });

  return jsonOk({ escaneos });
}