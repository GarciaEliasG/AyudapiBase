import QRCode from "qrcode";

import {
  getBearerToken,
  getSessionUser,
  jsonError,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "png").toLowerCase();

  if (format !== "png" && format !== "svg") {
    return jsonError("Formato no soportado. Usá png o svg.", 400);
  }

  const admin = createAdminServerClient();
  const { data: perfil, error: perfilError } = await admin
    .from("perfiles_paciente")
    .select("qr_activo,slug_qr")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (perfilError) {
    return jsonError(perfilError.message, 500);
  }
  if (!perfil || !perfil.qr_activo || !perfil.slug_qr) {
    return jsonError("No hay un QR activo para descargar.", 404);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const urlPublica = `${siteUrl}/e/${perfil.slug_qr}`;
  const qrOptions = {
    color: { dark: "#0F172A", light: "#FFFFFF" },
    errorCorrectionLevel: "H" as const,
    margin: 2,
  };

  if (format === "svg") {
    const svg = await QRCode.toString(urlPublica, {
      type: "svg",
      ...qrOptions,
    });
    return new Response(svg, {
      headers: {
        "Content-Disposition": "attachment; filename=ayudapi-qr.svg",
        "Content-Type": "image/svg+xml",
      },
    });
  }

  const buffer = await QRCode.toBuffer(urlPublica, {
    type: "png",
    width: 2048,
    ...qrOptions,
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": "attachment; filename=ayudapi-qr.png",
      "Content-Type": "image/png",
    },
  });
}