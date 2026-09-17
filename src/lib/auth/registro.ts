import type { SupabaseClient } from "@supabase/supabase-js";

import type { RolUsuario } from "@/lib/supabase/database";

import {
  CODIGO_BYPASS_REQUERIDO,
  motivoBloqueoMatriculaDePrueba,
} from "@/lib/auth/dev-bypass";
import { getRolesForUser, type SessionUser } from "@/lib/auth/session";
import {
  esMatriculaProvisoria,
  matriculaProvisoriaPara,
} from "@/lib/validation/profile";

const ROLES_PROVISIONABLES: RolUsuario[] = ["paciente", "medico", "institucion"];

/**
 * Alta definitiva de una cuenta en la base de datos.
 *
 * Solo se ejecuta con un email verificado: el usuario debe haber confirmado su
 * correo (link de verificación, código OTP o proveedor OAuth). De lo contrario
 * `crear_perfil_inicial` no se invoca y la cuenta queda sin datos clínicos.
 *
 * Además deja al usuario con `email_confirm: true` cuando llega por un flujo
 * que ya probó la tenencia del email (OTP o magic-link).
 */
export async function confirmarYProvisionar(
  admin: SupabaseClient,
  usuario: SessionUser,
  opciones?: {
    /** Datos del perfil solicitado (matrícula, especialidad, etc.). */
    appDatos?: Record<string, unknown> | null;
    /** Rol pedido por el frontend (p. ej. "Crear cuenta con Google" como médico). */
    appRol?: RolUsuario | null;
  },
): Promise<{ rol: RolUsuario; yaExistia: boolean }> {
  if (!usuario.emailVerificado) {
    await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true });
  }

  const appRol = opciones?.appRol ?? usuario.appRol;
  const appDatos = opciones?.appDatos ?? usuario.appDatos;

  // Si el frontend pidió un rol concreto (Google), se persiste en metadata para
  // que las futuras lecturas de `getSessionUser` coincidan.
  if (opciones?.appRol || opciones?.appDatos) {
    await admin.auth.admin.updateUserById(usuario.id, {
      user_metadata: { app_datos: appDatos, app_rol: appRol },
    });
  }

  const roles = await getRolesForUser(usuario.id);
  const yaExistia = roles.length > 0;
  let rol: RolUsuario | null =
    yaExistia
      ? ((["admin", "medico", "institucion", "paciente"] as RolUsuario[]).find((r) =>
          roles.includes(r),
        ) ?? null)
      : null;

  if (!rol) {
    const rolSolicitado = appRol;
    const rolFinal: RolUsuario =
      rolSolicitado && ROLES_PROVISIONABLES.includes(rolSolicitado)
        ? rolSolicitado
        : "paciente";

    const datosFinales: Record<string, unknown> = {
      ...(appDatos ?? {}),
      email: usuario.email,
    };

    // Guard central del bypass: ningún alta (register, confirmar-sesion,
    // auto-provisión) puede persistir una matrícula de prueba sin un email
    // autorizado en `DEV_ADMIN_EMAILS`. Falla cerrado con 403 en el borde.
    if (rolFinal === "medico") {
      const bloqueo = motivoBloqueoMatriculaDePrueba(usuario.email, datosFinales.matricula);
      if (bloqueo) {
        const error = new Error(bloqueo) as Error & { code?: string };
        error.code = CODIGO_BYPASS_REQUERIDO;
        throw error;
      }
    }

    // `matricula` es UNIQUE: un valor provisorio compartido ("S/M", vacío)
    // rompería el alta del segundo médico. Se genera uno único por usuario que
    // luego se reemplaza por la matrícula real en la vinculación.
    if (rolFinal === "medico" && esMatriculaProvisoria(datosFinales.matricula)) {
      datosFinales.matricula = matriculaProvisoriaPara(usuario.id);
    }

    const { error } = await admin.rpc("crear_perfil_inicial", {
      p_datos: datosFinales,
      p_rol: rolFinal,
      p_usuario_id: usuario.id,
    });
    if (error) {
      throw error;
    }
    rol = rolFinal;
  }

  return { rol, yaExistia };
}

export function prioridadPrincipal(roles: RolUsuario[]): RolUsuario | null {
  const prioridad: RolUsuario[] = ["admin", "medico", "institucion", "paciente"];
  return prioridad.find((r) => roles.includes(r)) ?? null;
}

/**
 * Alias inicial derivado del email para altas transparentes ("juan.perez@..."
 * → "Juan perez"). Nunca falla: ante cualquier duda devuelve "Paciente".
 */
export function aliasInicialPara(email: string | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const limpio = local
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ._-]/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 30);
  if (!limpio) {
    return "Paciente";
  }
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Garantiza la fila en `perfiles_paciente` para el usuario (upsert). Si no
 * existe —p. ej. un médico con rol dual que nunca completó su perfil de
 * paciente—, la crea con los datos básicos mediante `crear_perfil_inicial`,
 * que además le otorga el rol "paciente" (todo profesional conserva las
 * funcionalidades del paciente). Devuelve el id y si hubo creación.
 */
export async function asegurarPerfilPaciente(
  admin: SupabaseClient,
  usuario: Pick<SessionUser, "email" | "id">,
): Promise<{ creado: boolean; id: string } | null> {
  const { data: existente } = await admin
    .from("perfiles_paciente")
    .select("id")
    .eq("usuario_id", usuario.id)
    .maybeSingle();
  if (existente) {
    return { creado: false, id: (existente as { id: string }).id };
  }

  const { error } = await admin.rpc("crear_perfil_inicial", {
    p_datos: { alias: aliasInicialPara(usuario.email), email: usuario.email },
    p_rol: "paciente",
    p_usuario_id: usuario.id,
  });
  if (error) {
    return null;
  }

  const { data: creado } = await admin
    .from("perfiles_paciente")
    .select("id")
    .eq("usuario_id", usuario.id)
    .maybeSingle();
  if (!creado) {
    return null;
  }
  return { creado: true, id: (creado as { id: string }).id };
}