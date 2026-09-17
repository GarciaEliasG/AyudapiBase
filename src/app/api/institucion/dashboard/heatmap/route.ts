import {
  autenticarInstitucional,
  registrarConsultaAuditoria,
} from "@/lib/auth/institucion";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface ClusterHeatmap {
  cantidad: number;
  lat: number;
  lng: number;
  zona: string;
}

type HeatmapRpc = ClusterHeatmap[];

const PERIODOS = new Set(["1m", "6m", "12m"]);

function calcularDesde(periodo: string): string {
  const meses = periodo === "1m" ? 1 : periodo === "6m" ? 6 : 12;
  return new Date(Date.now() - meses * 30 * 24 * 60 * 60 * 1000).toISOString();
}

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
    .rpc("incidentes_heatmap", { p_periodo: periodo })
    .overrideTypes<HeatmapRpc>();
  if (error) {
    return jsonError(error.message, 500, error.code);
  }

  await registrarConsultaAuditoria({
    accion: "consulta_dashboard",
    detalles: { endpoint: "heatmap", periodo },
    institucionId: acceso.institucionId,
    userId: acceso.user.id,
  });

  return jsonOk({ clusters: data ?? [], desde: calcularDesde(periodo), periodo });
}