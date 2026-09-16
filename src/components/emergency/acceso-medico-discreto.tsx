"use client";

import { ChevronRight, Loader2, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RolUsuario } from "@/lib/supabase/database";

import { LoginModal } from "@/components/auth/login-modal";
import { useRol } from "@/lib/auth/use-rol";

interface AccesoMedicoDiscretoProps {
  /** Slug real del paciente cuyo panel ampliado se abrirá. */
  slug: string;
  /** Ruta alternativa tras la autenticación (usada en vistas demo). */
  afterAuthPath?: string;
}

/**
 * Acceso discreto para personal médico al final de la vista pública de
 * emergencia. Sin cajas ni botones de login en el centro del contenido y sin
 * validaciones restrictivas previas: un enlace de baja jerarquía al pie que
 * abre el flujo de autenticación de forma directa. Si la sesión ya es de un
 * médico, entra al panel ampliado; si la cuenta no tiene rol médico, se la
 * deriva a vincularlo (el acceso queda auditado en `/api/medico/paciente/[slug]`).
 */
export function AccesoMedicoDiscreto({ afterAuthPath, slug }: AccesoMedicoDiscretoProps) {
  const router = useRouter();
  const { loading, rol, session } = useRol();
  const [showLogin, setShowLogin] = useState(false);

  const destino =
    afterAuthPath ?? `/medico/paciente/${encodeURIComponent(slug)}?origen=qr-emergencia`;

  const yaEsMedico = Boolean(session && rol === "medico");

  function activar() {
    if (loading) {
      return;
    }
    if (yaEsMedico) {
      router.push(destino);
      return;
    }
    setShowLogin(true);
  }

  function manejarAutenticado({ rol: rolNuevo }: { rol: RolUsuario | null }) {
    if (rolNuevo === "medico") {
      router.push(destino);
      return;
    }
    router.push(`/auth/elegir-rol?destino=${encodeURIComponent(destino)}`);
  }

  return (
    <div className="pt-1">
      <button
        className="w-full flex items-center justify-between gap-2 border border-white/10 rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
        disabled={loading}
        onClick={activar}
        type="button"
      >
        <span className="flex items-center gap-2 text-white/50 text-xs font-medium">
          <Stethoscope className="text-white/40" size={13} />
          Acceso para profesionales / Médicos
        </span>
        {loading ? (
          <Loader2 className="animate-spin text-white/40" size={14} />
        ) : yaEsMedico ? (
          <span className="flex items-center gap-0.5 text-blue-300/80 text-xs font-semibold">
            Abrir panel <ChevronRight size={13} />
          </span>
        ) : (
          <ChevronRight className="text-white/40" size={14} />
        )}
      </button>

      {showLogin && (
        <LoginModal
          onAutenticado={manejarAutenticado}
          onClose={() => setShowLogin(false)}
          redirectTo={destino}
        />
      )}
    </div>
  );
}
