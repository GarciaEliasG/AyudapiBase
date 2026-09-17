import type { SupabaseClient } from "@supabase/supabase-js";

import {
  autenticarInstitucional,
  registrarConsultaAuditoria,
} from "@/lib/auth/institucion";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TAMANIO_MAXIMO = 50;
const TAMANIO_DEFECTO = 20;

interface LogAuditoriaResponse {
  accion: string;
  creado_en: string;
  detalles: unknown | null;
  direccion_ip: string | null;
  id: string;
  institucion_id: string | null;
  operador: string | null;
  paciente: string | null;
}

interface FilaLogAuditoria {
  accion: string;
  creado_en: string;
  detalles: unknown;
  direccion_ip: string | null;
  id: string;
  institucion_id: string | null;
  paciente_id: string | null;
  usuario_id: string | null;
}

interface IdentidadCuenta {
  email: string | null;
  metadatos: Record<string, unknown>;
}

function anonimizarPaciente(uuid: string | null): string | null {
  if (!uuid) {
    return null;
  }
  return `PAC-****-${uuid.slice(-4).toUpperCase()}`;
}

function nombreRealDeCuenta(cuenta: IdentidadCuenta): string | null {
  const opciones = [
    cuenta.metadatos.full_name,
    cuenta.metadatos.name,
    cuenta.metadatos.nombres,
    cuenta.metadatos.nombre,
  ];
  const nombre = opciones.find((v) => typeof v === "string" && v.trim().length > 0);
  if (typeof nombre === "string") {
    return nombre.trim();
  }
  return cuenta.email;
}

function parsearEntero(valor: string | null, fallback: number, maximo: number): number {
  const numero = Number.parseInt(valor ?? "", 10);
  if (Number.isNaN(numero) || numero < 1) {
    return fallback;
  }
  return Math.min(numero, maximo);
}

/**
 * Resuelve la identidad real de cada operador de la página (trazabilidad Ley
 * 25.326): el `usuario_id` NO se anonimiza. Se muestra el nombre de la
 * institución cuando el operador lo es, "nombre · MP {matrícula}" cuando es
 * médico y, en otro caso, el nombre/email de la cuenta. Solo `paciente_id` se
 * expone anonimizado (formato PAC-****-XXXX).
 */
async function resolverOperadores(
  admin: SupabaseClient,
  filas: FilaLogAuditoria[],
): Promise<Map<string, string | null>> {
  const ids = Array.from(
    new Set(filas.map((f) => f.usuario_id).filter((id): id is string => Boolean(id))),
  );
  const mapa = new Map<string, string | null>();
  if (ids.length === 0) {
    return mapa;
  }

  const [instituciones, medicos, cuentas] = await Promise.all([
    admin.from("perfiles_institucion").select("nombre, usuario_id").in("usuario_id", ids),
    admin.from("perfiles_medico").select("matricula, usuario_id").in("usuario_id", ids),
    Promise.all(
      ids.map(async (id): Promise<{ cuenta: IdentidadCuenta; id: string }> => {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error || !data?.user) {
          return { id, cuenta: { email: null, metadatos: {} } };
        }
        return {
          id,
          cuenta: {
            email: data.user.email ?? null,
            metadatos: (data.user.user_metadata ?? {}) as Record<string, unknown>,
          },
        };
      }),
    ),
  ]);

  const nombreInstitucion = new Map<string, string>();
  if (!instituciones.error) {
    for (const fila of (instituciones.data ?? []) as { nombre: string; usuario_id: string }[]) {
      nombreInstitucion.set(fila.usuario_id, fila.nombre);
    }
  }
  const matriculaMedico = new Map<string, string>();
  if (!medicos.error) {
    for (const fila of (medicos.data ?? []) as { matricula: string; usuario_id: string }[]) {
      matriculaMedico.set(fila.usuario_id, fila.matricula);
    }
  }

  for (const { id, cuenta } of cuentas) {
    const institucion = nombreInstitucion.get(id);
    const matricula = matriculaMedico.get(id);
    const nombre = nombreRealDeCuenta(cuenta);
    if (institucion) {
      mapa.set(id, institucion);
    } else if (matricula) {
      mapa.set(id, `${nombre ?? "Operador"} · MP ${matricula}`);
    } else {
      mapa.set(id, nombre ?? "Operador");
    }
  }
  return mapa;
}

export async function GET(req: Request) {
  const acceso = await autenticarInstitucional(req);
  if (!acceso.ok) {
    return acceso.response;
  }

  const { searchParams } = new URL(req.url);
  const page = parsearEntero(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = parsearEntero(searchParams.get("pageSize"), TAMANIO_DEFECTO, TAMANIO_MAXIMO);
  const accion = searchParams.get("accion")?.trim();
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  const admin = createAdminServerClient();
  let query = admin
    .from("logs_auditoria")
    .select("*", { count: "exact" })
    .order("creado_en", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (acceso.institucionId) {
    query = query.eq("institucion_id", acceso.institucionId);
  }
  if (accion) {
    query = query.eq("accion", accion);
  }
  if (desde) {
    query = query.gte("creado_en", desde);
  }
  if (hasta) {
    query = query.lte("creado_en", hasta);
  }

  const { data, error, count } = await query;
  if (error) {
    return jsonError(error.message, 500, error.code);
  }

  const total = count ?? 0;
  const filas = (data ?? []) as unknown as FilaLogAuditoria[];
  const operadores = await resolverOperadores(admin, filas);
  const logs: LogAuditoriaResponse[] = filas.map((fila) => ({
    accion: fila.accion,
    creado_en: fila.creado_en,
    detalles: fila.detalles ?? null,
    direccion_ip: fila.direccion_ip,
    id: fila.id,
    institucion_id: fila.institucion_id,
    operador: fila.usuario_id ? (operadores.get(fila.usuario_id) ?? null) : null,
    paciente: anonimizarPaciente(fila.paciente_id),
  }));

  await registrarConsultaAuditoria({
    accion: "consulta_auditoria",
    detalles: {
      accion_filtro: accion ?? null,
      desde: desde ?? null,
      hasta: hasta ?? null,
      page,
      pageSize,
    },
    institucionId: acceso.institucionId,
    userId: acceso.user.id,
  });

  return jsonOk({
    logs,
    page,
    pageSize,
    total,
    totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
  });
}