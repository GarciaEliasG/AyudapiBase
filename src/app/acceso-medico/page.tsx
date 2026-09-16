"use client";

import {
  ArrowRight,
  Camera,
  ChevronLeft,
  FileSearch,
  LogIn,
  LogOut,
  Shield,
  Stethoscope,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginModal } from "@/components/auth/login-modal";
import { useRol } from "@/lib/auth/use-rol";
import { createBrowserClient } from "@/lib/supabase/browser";

export default function AccesoMedicoPage() {
  const router = useRouter();
  const { loading, rol, session } = useRol();
  const [showLogin, setShowLogin] = useState(false);

  const esMedico = session !== null && rol === "medico";

  useEffect(() => {
    if (!loading && esMedico) {
      router.replace("/medico/escanear");
    }
  }, [esMedico, loading, router]);

  async function cerrarSesion() {
    await createBrowserClient().auth.signOut();
    router.push("/");
  }

  if (loading || esMedico) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "#0F1929", fontFamily: "Inter, sans-serif" }}
      >
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-blue-200/70 text-sm">
            {esMedico ? "Accediendo al panel médico..." : "Verificando sesión..."}
          </p>
        </div>
      </div>
    );
  }

  if (session && !esMedico) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
        style={{ background: "#0F1929", fontFamily: "Inter, sans-serif" }}
      >
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-amber-500/20">
            <UserX className="text-amber-400" size={26} />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-2">
            Acceso restringido
          </h1>
          <p className="text-blue-200/70 text-sm mb-8">
            Esta sección es exclusiva para personal de salud certificado con rol
            <span className="text-blue-300 font-semibold"> médico</span>.
          </p>
          <div className="space-y-3">
            <Link
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl transition-colors text-sm"
              href="/auth/elegir-rol?destino=%2Fmedico%2Fescanear"
              style={{ background: "#2563EB" }}
            >
              <Stethoscope size={16} /> Vincular rol de médico
            </Link>
            <Link
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              href="/mi-perfil"
            >
              <ArrowRight size={16} /> Ir a mi perfil
            </Link>
            <button
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              onClick={() => void cerrarSesion()}
            >
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
          <Link
            className="mt-6 flex items-center justify-center gap-1 text-sm text-blue-300/70 hover:text-blue-300 transition-colors w-full"
            href="/"
          >
            <ChevronLeft size={14} /> Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "#0F1929", fontFamily: "Inter, sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "#2563EB" }}
          >
            <Stethoscope className="text-blue-200" size={28} />
          </div>
        </div>

        <h1 className="text-3xl font-extrabold text-white text-center mb-1">
          Acceso médico profesional
        </h1>
        <p className="text-blue-200/70 text-sm text-center mb-8">
          Portal exclusivo para personal de{" "}
          <span className="text-blue-300">salud certificado</span>
        </p>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3 border border-gray-100 rounded-xl p-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Camera className="text-blue-600" size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Escanear QR</p>
                <p className="text-xs text-gray-500">
                  Acceso directo al historial en emergencias
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 border border-gray-100 rounded-xl p-3">
              <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileSearch className="text-emerald-600" size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  Buscar paciente
                </p>
                <p className="text-xs text-gray-500">
                  Búsqueda por nombre completo en la base de datos
                </p>
              </div>
            </div>
          </div>

          <button
            className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl transition-colors text-sm"
            onClick={() => setShowLogin(true)}
            style={{ background: "#2563EB" }}
          >
            <LogIn size={16} /> Iniciar sesión como médico
          </button>

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <Shield className="text-amber-600 flex-shrink-0 mt-0.5" size={14} />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Acceso auditado:</strong> ingresá con Google y, si aún no
              tenés cuenta, elegí el rol <strong>Médico/a</strong> con tu
              matrícula profesional en el panel de vinculación. Cada consulta
              queda registrada. Ley 25.326.
            </p>
          </div>
        </div>

        <Link
          className="mt-6 flex items-center justify-center gap-1 text-sm text-blue-300/70 hover:text-blue-300 transition-colors w-full"
          href="/"
        >
          <ChevronLeft size={14} /> Volver al inicio
        </Link>
      </div>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}