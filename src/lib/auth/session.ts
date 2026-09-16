import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { RolUsuario } from "@/lib/supabase/database";

import {
  createAdminServerClient,
  createAnonServerClient,
} from "@/lib/supabase/server";

export interface SessionUser {
  appDatos?: Record<string, unknown> | null;
  appRol?: RolUsuario | null;
  email?: string;
  /** `true` solo si el email fue confirmado (link de verificación, OTP o OAuth con verificación del proveedor). */
  emailVerificado: boolean;
  id: string;
}

function requiredEnv(name: string): string {
  // eslint-disable-next-line security/detect-object-injection -- lectura de variables de entorno por nombre
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno "${name}".`);
  }
  return value;
}

export function getAuthCredentials() {
  return {
    anonKey: requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    url: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  };
}

export function createUserClient(authToken: string) {
  const { anonKey, url } = getAuthCredentials();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${authToken}` },
    },
  });
}

const ROLES_VALIDOS = new Set<RolUsuario>(["paciente", "medico", "institucion", "admin"]);

export async function getSessionUser(authToken: string): Promise<SessionUser | null> {
  const { data, error } = await createAnonServerClient().auth.getUser(authToken);
  if (error || !data.user) {
    return null;
  }
  const usuario = data.user;
  const metadatos = (usuario.user_metadata ?? {}) as Record<string, unknown>;
  const appRolRaw = metadatos.app_rol;
  const appRol: RolUsuario | null =
    typeof appRolRaw === "string" && ROLES_VALIDOS.has(appRolRaw as RolUsuario)
      ? (appRolRaw as RolUsuario)
      : null;
  const appDatos =
    typeof metadatos.app_datos === "object" && metadatos.app_datos !== null
      ? (metadatos.app_datos as Record<string, unknown>)
      : null;

  return {
    appDatos,
    appRol,
    email: usuario.email ?? undefined,
    emailVerificado: usuario.email_confirmed_at != null,
    id: usuario.id,
  };
}

export async function getRolesForUser(userId: string): Promise<RolUsuario[]> {
  const { data, error } = await createAdminServerClient()
    .from("roles_usuario")
    .select("rol")
    .eq("usuario_id", userId);
  if (error || !data) {
    return [];
  }
  return (data as { rol: RolUsuario }[]).map((fila) => fila.rol);
}

/**
 * Rol único para compatibilidad con rutas y consumidores existentes. Con roles
 * múltiples (p. ej. médico-paciente) se devuelve el primer rol asociado.
 * Para saber si un usuario tiene un rol concreto usá `getRolesForUser`.
 */
export async function getRoleForUser(userId: string): Promise<RolUsuario | null> {
  const roles = await getRolesForUser(userId);
  return roles[0] ?? null;
}

export function requireUserIn(
  allowedRoles: RolUsuario[],
  role: RolUsuario | null,
  userId?: string,
) {
  if (!userId || !role || !allowedRoles.includes(role)) {
    return NextResponse.json(
      { error: { message: "Acceso denegado: rol no autorizado." } },
      { status: 403 },
    );
  }
  return null;
}

export function getBearerToken(authorization?: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length);
}

export function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}