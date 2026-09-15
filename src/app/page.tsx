"use client";

import {
  Activity,
  ArrowRight,
  ChevronRight,
  FileText,
  Heart,
  MapPin,
  Phone,
  QrCode,
  Shield,
  Star,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function HomePage() {
  const { loading: loadingSession, session } = useSession();
  const [qrReal, setQrReal] = useState<{ slug: string; url_publica: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    apiFetch<{ perfil: { qr_activo: boolean; slug_qr: string | null } }>("/api/profile", session)
      .then(({ perfil }) => {
        if (perfil.qr_activo && perfil.slug_qr) {
          setQrReal({ slug: perfil.slug_qr, url_publica: `${SITE_URL}/e/${perfil.slug_qr}` });
        }
      })
      .catch(() => setQrReal(null));
  }, [session]);
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />

      <section
        className="relative min-h-[580px] flex flex-col justify-center overflow-hidden"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1564947471495-f427662213cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-[#0F1929]/85" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/80 text-xs px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Sistema activo en 12 zonas de Argentina
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight mb-4 max-w-2xl">
            Tu información médica,{" "}
            <span className="text-blue-400">disponible en el minuto que más importa.</span>
          </h1>
          <p className="text-white/70 text-base sm:text-lg max-w-lg mb-8">
            AyudAPI transforma un código QR en un sistema de emergencia completo. Condiciones
            críticas, medicación y contactos accesibles sin desbloquear tu celular, en segundos.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              href="/crear-perfil"
            >
              {session ? "Editar mi perfil" : "Crear mi perfil gratuito"} <ArrowRight size={16} />
            </Link>
            <Link
              className="flex items-center gap-2 bg-white/10 border border-white/30 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              href={session ? (qrReal ? qrReal.url_publica : "/mi-perfil") : "/emergencia"}
            >
              <QrCode size={16} /> {session ? "Ver QR asociado" : "Ver demo de emergencia"}
            </Link>
          </div>
        </div>

        <div className="relative bg-[#0F1929] border-t border-white/10 hidden sm:block">
          <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-4 gap-4">
            {[
              { icon: <Zap className="text-blue-400" size={14} />, value: "50%", label: "Reducción en tiempo de respuesta" },
              { icon: <Heart className="text-blue-400 fill-blue-400" size={14} />, value: "847", label: "Vidas asistidas en 2025" },
              { icon: <Users className="text-blue-400" size={14} />, value: "4.2k+", label: "Usuarios registrados" },
              { icon: <MapPin className="text-blue-400" size={14} />, value: "12", label: "Zonas con cobertura activa" },
            ].map(({ icon, value, label }) => (
              <div className="flex items-center gap-2" key={label}>
                {icon}
                <div>
                  <div className="text-white font-bold text-lg leading-none">{value}</div>
                  <div className="text-white/50 text-xs mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-blue-600 text-xs font-bold tracking-widest uppercase mb-2">¿Cómo funciona?</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">Simple, rápido y seguro</h2>
          <p className="text-gray-500 max-w-md mx-auto mb-12">
            Configuralo en minutos. Funciona sin que estés consciente, sin que tu celular esté desbloqueado.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { n: "01", icon: <FileText className="text-blue-600" size={20} />, title: "Registrá tu perfil", desc: "Cargá tus datos médicos críticos: alergias, medicación, condiciones y contactos de emergencia." },
              { n: "02", icon: <QrCode className="text-blue-600" size={20} />, title: "Generá tu QR", desc: "Obtené un código QR seguro y revocable. Imprimilo en una pulsera, tarjeta o llevalo en tu celular." },
              { n: "03", icon: <Phone className="text-blue-600" size={20} />, title: "En una emergencia", desc: "Cualquier persona que escanee el QR accede en segundos a tu información vital y puede alertar al SAME." },
            ].map(({ n, icon, title, desc }) => (
              <div className="border border-gray-100 rounded-2xl p-6 text-left hover:shadow-md transition-shadow" key={n}>
                <div className="flex items-start justify-between mb-4">
                  <span className="text-5xl font-black text-gray-100 leading-none">{n}</span>
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">{icon}</div>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 text-center md:text-left">
            <p className="text-blue-600 text-xs font-bold tracking-widest uppercase mb-2">Tu QR en acción</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
              {loadingSession
                ? "Cargando tu código…"
                : session
                  ? qrReal
                    ? "Este es tu QR real"
                    : "Probá la vista de emergencia"
                  : "Probá cómo funciona el QR"}
            </h2>
            <p className="text-gray-500 max-w-md mx-auto md:mx-0 mb-6">
              {loadingSession
                ? "Verificando tu sesión…"
                : session
                  ? qrReal
                    ? "Está activo y vinculado a tus datos médicos. Cualquier persona que lo escanee accederá solo a tu información vital de emergencia."
                    : "Ya iniciaste sesión pero todavía no generaste tu código. Generalo para que quede vinculado a tus datos desde la base de datos."
                  : "Este es un QR de demostración de baja resolución. Al crear tu perfil recibís tu código único y seguro, que podés revocar cuando quieras."}
            </p>
            {!loadingSession && (
              <Link
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                href={session && qrReal ? "/mi-perfil" : "/crear-perfil"}
              >
                {session && qrReal ? "Ir a mi perfil" : "Crear mi QR real gratis"} <ArrowRight size={16} />
              </Link>
            )}
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
              {loadingSession ? (
                <div className="w-[180px] h-[180px] rounded-xl bg-gray-100 animate-pulse" />
              ) : session && qrReal ? (
                <>
                  <QRCodeSVG level="H" size={180} value={qrReal.url_publica} />
                  <div className="flex items-center justify-center gap-1.5 mt-4">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    <span className="text-xs font-semibold text-green-600">QR activo</span>
                  </div>
                  <a
                    className="block mt-2 text-xs text-blue-600 text-center font-mono truncate max-w-[220px]"
                    href={qrReal.url_publica}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {qrReal.url_publica}
                  </a>
                </>
              ) : session && !qrReal ? (
                <div className="w-[180px] h-[180px] flex flex-col items-center justify-center text-center px-4">
                  <QrCode className="text-gray-300 mb-3" size={64} />
                  <p className="text-xs text-gray-400">Todavía no generaste tu QR.</p>
                </div>
              ) : (
                <>
                  <div className="opacity-40 grayscale">
                    <QRCodeSVG level="H" size={180} value={`${SITE_URL}/e/preview`} />
                  </div>
                  <p className="mt-4 text-xs text-gray-400 text-center">QR de prueba · sin datos reales</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-blue-600 text-xs font-bold tracking-widest uppercase mb-2">El ecosistema completo</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Diseñado para cada actor de la emergencia
          </h2>
          <p className="text-gray-500 max-w-md mx-auto mb-12">
            Desde el paciente hasta la obra social, cada rol tiene su interfaz optimizada para el momento crítico.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                role: "SOY PACIENTE",
                icon: <QrCode className="text-blue-600" size={18} />,
                iconBg: "bg-blue-50",
                title: "Cargá tu perfil médico y generá tu QR",
                desc: "Registrá tus condiciones críticas, medicación, alergias y contactos de emergencia. Generá tu código QR personalizado para llevar siempre con vos.",
                btn: "Crear mi perfil",
                btnClass: "bg-blue-600 hover:bg-blue-700 text-white",
                href: "/crear-perfil",
              },
              {
                role: "ESTOY AYUDANDO A ALGUIEN",
                icon: <Heart className="text-amber-600 fill-amber-600" size={18} />,
                iconBg: "bg-amber-50",
                title: "Escaneé un QR o ingresá el código",
                desc: "Accedé al perfil de emergencia de la persona que necesita ayuda. Ver condiciones críticas, contactos ICE y alertar al SAME con geolocalización.",
                btn: "Ver demo de emergencia",
                btnClass: "bg-amber-500 hover:bg-amber-600 text-white",
                href: "/emergencia",
              },
              {
                role: "SOY MÉDICO / PARAMÉDICO",
                icon: <Activity className="text-emerald-600" size={18} />,
                iconBg: "bg-emerald-50",
                title: "Acceso profesional certificado",
                desc: "Iniciá sesión con tu matrícula profesional para acceder a datos clínicos completos: medicación, estudios, notas del paciente e historial de alertas.",
                btn: "Acceso médico",
                btnClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
                href: "/acceso-medico",
              },
              {
                role: "OBRA SOCIAL / HOSPITAL",
                icon: <Shield className="text-violet-600" size={18} />,
                iconBg: "bg-violet-50",
                title: "Panel institucional y analytics",
                desc: "Accedé a reportes de siniestralidad, mapas de incidentes, tiempos de respuesta y dashboards para optimizar la distribución de recursos.",
                btn: "Panel institucional",
                btnClass: "bg-violet-600 hover:bg-violet-700 text-white",
                href: "/institucional",
              },
            ].map(({ role, icon, iconBg, title, desc, btn, btnClass, href }) => (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 text-left flex flex-col" key={role}>
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", iconBg)}>{icon}</div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{role}</p>
                <h3 className="font-bold text-gray-900 text-sm mb-2 leading-snug">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-4 flex-1">{desc}</p>
                <Link
                  className={cn("w-full py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1", btnClass)}
                  href={session && href === "/crear-perfil" ? "/mi-perfil" : href}
                >
                  {session && href === "/crear-perfil" ? "Ver mi perfil" : btn} <ChevronRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-4xl mx-auto mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: <Shield className="text-blue-600" size={16} />, title: "Privacidad por diseño", desc: "Cumplimiento estricto con la Ley 25.326 de protección de datos personales. Sin rastreo permanente, sin venta de datos." },
            { icon: <Star className="text-emerald-600" size={16} />, title: "Respaldo legal para el interviniente", desc: "Encuadrado en el Estado de Necesidad (Art. 34 CP) y la Obligación de Socorro (Art. 108 CP). Ayudá con tranquilidad." },
            { icon: <Zap className="text-amber-500" size={16} />, title: "Tokens revocables", desc: "Si perdés tu pulsera o tarjeta QR, invalidala al instante desde tu perfil. El QR viejo queda inutilizable de forma inmediata." },
          ].map(({ icon, title, desc }) => (
            <div className="flex gap-3" key={title}>
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">{icon}</div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-r from-blue-700 to-blue-600 py-16 px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Tu QR puede salvar tu vida.</h2>
        <p className="text-white/80 max-w-xl mx-auto mb-8">
          En un accidente de tránsito, una crisis diabética o una reacción alérgica, cada segundo cuenta. Registrarte es gratis y toma menos de 5 minutos.
        </p>
        <Link
          className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition-colors border-2 border-white/50"
          href={session ? "/mi-perfil" : "/crear-perfil"}
        >
          {session ? "Ver mi perfil" : "Crear mi perfil AyudAPI gratis"} <ArrowRight size={16} />
        </Link>
      </section>

      <Footer />
    </div>
  );
}