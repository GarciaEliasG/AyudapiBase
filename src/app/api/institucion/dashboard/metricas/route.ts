import {
  autenticarInstitucional,
  registrarConsultaAuditoria,
} from "@/lib/auth/institucion";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface ResumenMetricas {
  atenciones: number;
  en_curso: number;
  escaneos: number;
  incidentes: number;
  registros_medicos: number;
  resueltos: number;
}

interface EstadoMetrica {
  cantidad: number;
  estado: string;
}

interface ZonaMetrica {
  atenciones: number;
  escaneos: number;
  incidentes: number;
  lat: number;
  lng: number;
  zona: string;
}

interface PatologiaMetrica {
  atenciones: number;
  incidentes: number;
  patologia: string;
}

interface MetricasRpc {
  desde: string;
  periodo: string;
  por_estado: EstadoMetrica[];
  por_patologia: PatologiaMetrica[];
  por_zona: ZonaMetrica[];
  resumen: ResumenMetricas;
}

const PERIODOS = new Set(["1m", "6m", "12m"]);

export async function GET(req: Request) {
  const acceso = await autenticarInstitucional(req);
  if (!acceso.ok) {
    return acceso.response;
  }

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? "12m";
  if (!PERIODOS.has(periodo)) {
    return jsonError("El parámetro 'periodo' debe ser 12m, 6m o 1m.", 400);
  }

  const admin = createAdminServerClient();
  const { data, error } = await admin
    .rpc("dashboard_metricas", { p_periodo: periodo })
    .overrideTypes<MetricasRpc>();
  if (error) {
    return jsonError(error.message, 500, error.code);
  }

  await registrarConsultaAuditoria({
    accion: "consulta_dashboard",
    detalles: { endpoint: "metricas", periodo },
    institucionId: acceso.institucionId,
    userId: acceso.user.id,
  });

  return jsonOk(data);
}