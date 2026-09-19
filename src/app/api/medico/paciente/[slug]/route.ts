import type { Medicamento } from "@/lib/supabase/database";

import { inviteModoMedico } from "@/lib/auth/invitacion";
import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { decryptSensitiveValue } from "@/lib/security/cipher";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface PacienteClinico {
  id: string;
  alias: string;
  nombre_completo: string | null;
  fecha_nacimiento: string | null;
  genero: string | null;
  grupo_sanguineo: string | null;
  altura_cm: number | null;
  peso_kg: number | null;
  alergias: unknown[] | null;
  patologias: unknown[] | null;
  medicacion: Medicamento[] | null;
  notas_medicas: string | null;
  contactos_emergencia: unknown[] | null;
  creado_en: string;
}

function descifrarLista<T>(valor: string | null): T[] | null {
  if (!valor || valor.length === 0) {
    return null;
  }
  try {
    return decryptSensitiveValue<T[]>(valor);
  } catch {
    try {
      return JSON.parse(valor) as T[];
    } catch {
      return null;
    }
  }
}

function descifrarTexto(valor: string | null): string | null {
  if (!valor || valor.length === 0) {
    return null;
  }
  try {
    return decryptSensitiveValue<string>(valor);
  } catch {
    try {
      const parsed = JSON.parse(valor) as unknown;
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      return null;
    }
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const origen = new URL(req.url).searchParams.get("origen");
  const accesoDesdeEmergencia = origen === "qr-emergencia";

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
    return jsonError("Solo el personal médico puede acceder a historiales clínicos.", 403);
  }

  if (!slug || slug.trim().length === 0) {
    return jsonError("El slug del paciente es obligatorio.", 400);
  }

  const admin = createAdminServerClient();

  // Marca de excepción por invitación del operador (para etiquetar la
  // auditoría). Independiente del QR: corre en paralelo con su lectura.
  const inviteModoPromise = inviteModoMedico(admin, user.id);

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
    .select("*")
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

  // Operación bajo excepción por invitación: queda diferenciada en la
  // auditoría (Ley 25.326). Ausente en médicos con credencial completa.
  const inviteModo = await inviteModoPromise;
  await admin.from("logs_auditoria").insert({
    accion: "acceso_historial_clinico",
    paciente_id: perfil.id,
    usuario_id: user.id,
    detalles: {
      slug,
      origen: accesoDesdeEmergencia ? "qr-emergencia" : "panel-medico",
      ...(inviteModo ? { invite_modo: inviteModo } : {}),
    },
  });

  const respuesta: PacienteClinico = {
    id: perfil.id,
    alias: perfil.alias,
    nombre_completo: perfil.nombre_completo,
    fecha_nacimiento: perfil.fecha_nacimiento,
    genero: perfil.genero,
    grupo_sanguineo: perfil.grupo_sanguineo,
    altura_cm: perfil.altura_cm,
    peso_kg: perfil.peso_kg,
    alergias: perfil.alergias as unknown[] | null,
    patologias: perfil.patologias as unknown[] | null,
    medicacion: descifrarLista<Medicamento>(perfil.medicacion),
    notas_medicas: descifrarTexto(perfil.notas_medicas),
    contactos_emergencia: perfil.contactos_emergencia as unknown[] | null,
    creado_en: perfil.creado_en,
  };

  return jsonOk(respuesta);
}
