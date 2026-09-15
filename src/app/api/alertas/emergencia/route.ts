import { parseJsonBody } from "@/lib/api/http";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SLUG_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{10,32}$/;

interface AlertaRequest {
  lat?: number;
  lng?: number;
  precision?: "exacta" | "aproximada";
  slug?: string;
}

function esCoordenadaValida(valor: unknown, rango: [number, number]): boolean {
  return typeof valor === "number" && valor >= rango[0] && valor <= rango[1];
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody<AlertaRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { lat, lng, precision, slug } = parsed.data;

  if (typeof slug !== "string" || !SLUG_REGEX.test(slug)) {
    return jsonError("Slug de emergencia inválido.", 400);
  }

  const exacta =
    precision === "exacta" &&
    esCoordenadaValida(lat, [-90, 90]) &&
    esCoordenadaValida(lng, [-180, 180]);

  const admin = createAdminServerClient();
  const { data, error } = await admin.rpc("activar_alerta_emergencia", {
    p_exacta: exacta,
    p_lat: exacta ? lat : null,
    p_lng: exacta ? lng : null,
    p_slug: slug,
  });

  if (error) {
    if (error.message?.toLowerCase().includes("qr no activo")) {
      return jsonError("El QR no está activo. No se pudo enviar la alerta.", 404);
    }
    return jsonError("No se pudo enviar la alerta. Intentá de nuevo.", 500, error.message);
  }

  const resultado = data as { incidente_id: string; notificaciones: number };

  return jsonOk({
    enviada: true,
    exacta,
    incidente_id: resultado.incidente_id,
    message: "Alerta enviada.",
    notificaciones: resultado.notificaciones,
  });
}