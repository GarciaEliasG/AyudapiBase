import type { RolUsuario } from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import { confirmarYProvisionar } from "@/lib/auth/registro";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient, createAnonServerClient } from "@/lib/supabase/server";
import {
  esCuitValido,
  esEmailValido,
  esMatriculaValida,
} from "@/lib/validation/profile";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;
const ROLES_REGISTRABLES: RolUsuario[] = ["paciente", "medico", "institucion"];

interface RegisterRequest {
  alias?: string;
  cuit?: string;
  documentacion?: unknown[];
  email: string;
  especialidad?: string;
  matricula?: string;
  nombre?: string;
  nombre_completo?: string;
  password: string;
  rol?: RolUsuario;
  telefono_contacto?: string;
}

/**
 * Alta de cuenta por email y contraseña.
 *
 * El usuario queda habilitado de inmediato (`email_confirm: true`), su perfil
 * se crea en la base de datos (`crear_perfil_inicial`) y la respuesta incluye
 * la sesión de Supabase para que el frontend lo autentique sin pasos extra.
 *
 * Nota: se elimina deliberadamente la confirmación por código OTP porque el
 * despacho de emails (SMTP) no está garantizado; una cuenta creada debe poder
 * entrar siempre, de forma fluida.
 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody<RegisterRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const input = parsed.data;

  const email = input.email?.trim() ?? "";
  if (!esEmailValido(email)) {
    return jsonError("Ingresá un email válido.", 400);
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    return jsonError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      400,
    );
  }

  const rol = input.rol ?? "paciente";
  if (!ROLES_REGISTRABLES.includes(rol)) {
    return jsonError("No podés registrarte con el rol seleccionado.", 400);
  }

  if (rol === "medico") {
    const matricula = input.matricula?.trim() ?? "";
    const especialidad = input.especialidad?.trim() ?? "";
    if (!esMatriculaValida(matricula)) {
      return jsonError("La matrícula profesional es obligatoria y debe ser válida.", 400);
    }
    if (especialidad.length < 3) {
      return jsonError("La especialidad es obligatoria.", 400);
    }
  }

  if (rol === "institucion") {
    const nombre = input.nombre?.trim() ?? "";
    const cuit = input.cuit?.trim() ?? "";
    const documentacion = input.documentacion ?? [];
    if (nombre.length < 3) {
      return jsonError("El nombre de la institución es obligatorio.", 400);
    }
    if (!esCuitValido(cuit)) {
      return jsonError("El CUIT es obligatorio y debe tener 11 dígitos.", 400);
    }
    if (!Array.isArray(documentacion) || documentacion.length === 0) {
      return jsonError("La documentación de respaldo es obligatoria.", 400);
    }
  }

  const admin = createAdminServerClient();

  const datos = {
    alias: input.alias,
    cuit: input.cuit,
    documentacion: input.documentacion,
    email,
    especialidad: input.especialidad,
    matricula: input.matricula,
    nombre: input.nombre,
    nombre_completo: input.nombre_completo,
    telefono_contacto: input.telefono_contacto,
  };

  // 1. Se crea la cuenta ya confirmada. Sin confirmar por email, el usuario
  // quedaría atrapado dependiendo de un SMTP que puede no estar disponible.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: input.password,
    user_metadata: {
      app_datos: datos,
      app_rol: rol,
    },
  });
  if (authError) {
    if (authError.code === "email_exists") {
      return jsonError("Ya existe una cuenta con ese email. Iniciá sesión.", 409);
    }
    if (authError.status === 422 || authError.code === "weak_password") {
      return jsonError(
        "No se pudo crear la cuenta: revisá el email y la contraseña.",
        400,
      );
    }
    return jsonError(authError.message, authError.status ?? 400);
  }
  if (!authData.user) {
    return jsonError("No se pudo crear la cuenta. Reintentá.", 400);
  }
  const userId = authData.user.id;

  // 2. Alta definitiva del perfil (roles_usuario / perfiles_*).
  try {
    await confirmarYProvisionar(admin, {
      email,
      emailVerificado: true,
      id: userId,
      appDatos: datos,
      appRol: rol,
    });
  } catch (err) {
    // El perfil pendiente se auto-provisiona en el siguiente acceso
    // (/api/auth/rol). No se bloquea el ingreso por un fallo transitorio.
    console.error("[register] No se pudo provisionar el perfil:", err);
  }

  // 3. Sesión completa para que el usuario quede logueado en el acto.
  const { data: signInData, error: signInError } =
    await createAnonServerClient().auth.signInWithPassword({
      email,
      password: input.password,
    });
  if (signInError) {
    console.error("[register] Cuenta creada pero no se pudo autenticar:", signInError.message);
    return jsonOk(
      {
        message: "Tu cuenta se creó correctamente. Ahora iniciá sesión.",
        requiere_login: true,
        rol,
        session: { access_token: null, refresh_token: null },
        user: { email, id: userId },
      },
      201,
    );
  }

  return jsonOk(
    {
      message: "Tu cuenta fue creada correctamente.",
      rol,
      requiere_verificacion: false,
      session: {
        access_token: signInData.session?.access_token ?? null,
        refresh_token: signInData.session?.refresh_token ?? null,
      },
      user: {
        email,
        id: userId,
      },
    },
    201,
  );
}