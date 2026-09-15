"use client";

import { Check, ChevronLeft, Download, Eye, Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { LoginModal } from "@/components/auth/login-modal";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";

interface GeneratedQr {
  qr_activo: boolean;
  slug: string;
  url_publica: string;
}

export default function QrSuccessPage() {
  const { session } = useSession();
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<GeneratedQr | null>(null);

  useEffect(() => {
    if (!session) return;
    apiFetch<GeneratedQr>("/api/qr/generate", session)
      .then((data) => setQr(data))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "No se pudo generar el QR."),
      )
      .finally(() => setLoading(false));
  }, [session]);

  async function handleDownload() {
    if (!session || !qr) return;
    const res = await fetch(`/api/qr/download?format=png`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ayudapi-qr.png";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url_publica);
      setError(null);
    } catch {
      setError("No se pudo copiar el enlace.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="text-green-600 stroke-[2.5]" size={28} />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 text-center mb-2">¡Tu perfil está listo!</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Tu código QR fue generado. Guardalo en tu celular, imprimilo en una{" "}
          <span className="text-blue-600">tarjeta</span> o <span className="text-blue-600">pulsera</span> para tener siempre a mano.
        </p>

        {loading && session && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        )}

        {!loading && error && !qr && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-xs text-amber-800 leading-relaxed">{error}</p>
            <button className="mt-2 text-xs font-semibold text-blue-600 hover:underline" onClick={() => setShowLogin(true)}>
              Iniciar sesión para continuar
            </button>
          </div>
        )}

        {!loading && qr && (
          <>
            <div className="flex justify-center mb-2">
              <div className="border border-gray-100 rounded-2xl p-4">
                <QRCodeSVG level="H" size={160} value={qr.url_publica} />
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center mb-5">{qr.url_publica}</p>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-blue-800 mb-1">Token de seguridad</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-blue-700 font-mono">{qr.slug}</span>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-xs text-green-600 font-semibold">Activo</span>
              </div>
              <p className="text-xs text-blue-600 mt-1">Podés revocar este QR en cualquier momento desde tu perfil.</p>
            </div>

            <div className="space-y-2.5">
              <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm" onClick={handleDownload}>
                <Download size={16} /> Descargar QR (PNG)
              </button>
              <button className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl transition-colors text-sm" onClick={handleShare}>
                <Share2 size={16} /> Copiar enlace de emergencia
              </button>
              <Link className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-blue-50 text-blue-600 font-semibold py-3 rounded-xl transition-colors text-sm" href={`/e/${qr.slug}`}>
                <Eye size={16} /> Ver cómo me verán en emergencia
              </Link>
              <Link className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl transition-colors text-sm" href="/mi-perfil">
                Ir a mi perfil
              </Link>
            </div>
          </>
        )}

        <Link className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors mt-5 flex items-center justify-center gap-1" href="/">
          <ChevronLeft size={12} /> Volver al inicio
        </Link>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}