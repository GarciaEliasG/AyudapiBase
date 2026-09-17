"use client";

import { AlertTriangle, Home, Loader2, RefreshCw, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { RolUsuario } from "@/lib/supabase/database";

import { notificarActividadSesion } from "@/lib/auth/actividad";
import {
  guardarModoGoogle,
  leerModoGoogle,
  limpiarModoGoogle,
  RUTA_DESTINO_KEY,
  type ModoGoogle,
} from "@/lib/auth/destino";
import { esRutaMedica, rutaPorRol } from "@/lib/auth/ruteo";
import { createBrowserClient } from "@/lib/supabase/browser";
import {
  perfilMedicoCompleto,
  perfilPacienteCompleto,
} from "@/lib/validation/profile";

interface PerfilMedicoResumen {
  especialidad?: string | null;
  matricula?: string | null;
  telefono_contacto?: string | null;
}

interface PerfilRespuesta {
  perfil?: {
    alias?: string | null;
    fecha_nacimiento?: string | null;
    genero?: string | null;
    grupo_sanguineo?: string | null;
  } | null;
  perfil_medico?: PerfilMedicoResumen | null;
  rol?: RolUsuario | null;
}

interface EstadoRespuesta {
  rol: RolUsuario | null;
  roles: RolUsuario[];
}

type Estado = "procesando" | "error";

/** Motivo del error: genérico, o cuenta Google sin registro previo. */
type TipoError = "generico" | "no-registrado";

function rutearPorRol(
  router: ReturnType<typeof useRouter>,
  rol: RolUsuario | null,
  perfil?: PerfilRespuesta["perfil"],
  perfilMedico?: PerfilMedicoResumen | null,
) {
  const destino = window.sessionStorage.getItem(RUTA_DESTINO_KEY);

  // Médico con perfil incompleto (matrícula/especialidad/teléfono): se le pide
  // completar los datos obligatorios antes de operar. Se conserva
  // RUTA_DESTINO_KEY para reanudar el flujo (p. ej. un QR de emergencia) al
  // terminar.
  if (rol === "medico" && perfilMedico && !perfilMedicoCompleto(perfilMedico)) {
    router.replace("/medico/completar-perfil");
    return;
  }

  // Destino del panel médico sin rol médico: en lugar de chocar con un 403 se
  // ofrece vincular el rol, retomando el destino al finalizar.
  if (esRutaMedica(destino) && rol !== "medico" && rol !== "admin") {
    window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
    router.replace(`/auth/elegir-rol?destino=${encodeURIComponent(destino ?? "")}`);
    return;
  }

  window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
  router.replace(
    rutaPorRol(rol, perfilPacienteCompleto(perfil ?? {}), destino, window.location.pathname),
  );
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [estado, setEstado] = useState<Estado>("procesando");
  const [tipoError, setTipoError] = useState<TipoError>("generico");
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  /**
   * Modo del flujo OAuth capturado UNA sola vez al montar. El inicializador
   * de estado se evalúa una única vez por instancia del componente, por lo
   * que el valor sobrevive a re-ejecuciones del efecto (StrictMode en
   * desarrollo) y a re-renders: aunque `limpiarModoGoogle()` borre la
   * bandera persistida durante el procesamiento, este flujo conserva su
   * copia y siempre decide con el modo real elegido por el usuario.
   */
  const [modo] = useState<ModoGoogle>(() => leerModoGoogle());

  /**
   * Reinicia el flujo OAuth en modo registro para una cuenta Google que no
   * está registrada. Se usa en el estado "Gmail no encontrado".
   */
  async function iniciarRegistroConGoogle() {
    setCreandoCuenta(true);
    try {
      guardarModoGoogle("registro");
      const res = await fetch("/api/auth/google", {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        url?: string;
      } | null;
      if (!res.ok || !payload?.url) {
        throw new Error(
          payload?.error?.message ?? "No pudimos iniciar el registro con Google.",
        );
      }
      window.location.href = payload.url;
    } catch (err) {
      setMensajeError(
        err instanceof Error ? err.message : "No pudimos iniciar el registro. Reintentá.",
      );
      setCreandoCuenta(false);
    }
  }

  useEffect(() => {
    let activo = true;
    const client = createBrowserClient();

    void (async () => {
      // 1. Error devuelto por el proveedor OAuth (p. ej. Google "access_denied").
      const oauthError = searchParams.get("error");
      if (oauthError) {
        setEstado("error");
        setMensajeError(
          "No pudimos completar el acceso con el proveedor elegido. Intentalo de nuevo.",
        );
        return;
      }

      try {
        // 2. Obtención de la sesión.
        //
        // Flujo PKCE ("?code=..."): se canjea por la sesión real.
        // Flujo implícito ("#access_token=...&refresh_token=..."): el token
        //   viaja en el hash de la URL; se pasa a setSession directamente.
        // Fallback: se recupera la sesión ya persistida por el cliente.
        const code = searchParams.get("code");
        let accessToken: string | null = null;

        if (code) {
          const { data, error } = await client.auth.exchangeCodeForSession(code);
          if (!error && data.session?.access_token) {
            accessToken = data.session.access_token;
          }
        }

        if (!accessToken) {
          const hashParams = new URLSearchParams(
            window.location.hash.replace(/^#/, ""),
          );
          const hashAccess = hashParams.get("access_token");
          if (hashAccess) {
            await client.auth.setSession({
              access_token: hashAccess,
              refresh_token: hashParams.get("refresh_token") ?? "",
            });
            accessToken = hashAccess;
            // Se limpia el hash de la URL para no exponer tokens en la barra de
            // direcciones y para no reprocesarlos al recargar la página.
            window.history.replaceState(null, "", window.location.pathname);
          }
        }

        if (!accessToken) {
          const { data } = await client.auth.getSession();
          accessToken = data.session?.access_token ?? null;
        }

        if (!activo) return;
        if (!accessToken) {
          setEstado("error");
          setMensajeError(
            "No encontramos una sesión de Google activa. Ingresá nuevamente para continuar.",
          );
          return;
        }

        const autorizacion = {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        };

        // 3. Reconocimiento del usuario en base de datos, SIN provisionar.
        //
        // Bloqueo de auto-registro: si la cuenta es nueva (sin roles
        // vinculados en `roles_usuario`) y el flujo era "login", la sesión de
        // Google se cancela de inmediato y se informa "Gmail no encontrado"
        // con acceso directo al registro. Solo el flujo "registro" deriva al
        // panel de vinculación de rol. Se conserva RUTA_DESTINO_KEY para
        // retomar. `modo` viene del estado (capturado al montar) para que
        // re-ejecuciones del efecto no lo pierdan; aquí se limpia la bandera
        // persistida para no dejar estado residual.
        limpiarModoGoogle();
        const est = await fetch("/api/auth/estado", { headers: autorizacion });
        const payloadEstado = (await est.json().catch(() => null)) as EstadoRespuesta | null;
        if (!est.ok) {
          throw new Error("No pudimos reconocer tu cuenta. Reintentá.");
        }
        if (!payloadEstado || payloadEstado.roles.length === 0) {
          if (!activo) return;
          if (modo === "login") {
            try {
              await client.auth.signOut();
            } catch {
              // La sesión ya es inválida; igual se informa sin acceso.
            }
            if (!activo) return;
            setTipoError("no-registrado");
            setEstado("error");
            setMensajeError(
              "Gmail no encontrado: esta cuenta de Google no está registrada. Creá tu cuenta para continuar.",
            );
            return;
          }
          router.replace("/auth/elegir-rol");
          return;
        }

        // 4. Confirmación del email y rol principal de la cuenta existente.
        const conf = await fetch("/api/auth/confirmar-sesion", {
          body: JSON.stringify({}),
          headers: { ...autorizacion, "Content-Type": "application/json" },
          method: "POST",
        });
        const payloadConf = (await conf.json().catch(() => null)) as {
          error?: { message?: string };
          rol?: RolUsuario | null;
        } | null;
        if (!conf.ok) {
          throw new Error(
            payloadConf?.error?.message ?? "No se pudo completar el acceso.",
          );
        }
        const rol = payloadConf?.rol ?? payloadEstado.rol;

        // Aviso de actividad: inicio de sesión exitoso de una cuenta
        // existente (best-effort, nunca bloquea la navegación).
        void notificarActividadSesion(accessToken, "inicio_sesion");

        // 5. Lectura del perfil para decidir a dónde enviar al usuario.
        let perfil: PerfilRespuesta["perfil"] = null;
        let perfilMedico: PerfilRespuesta["perfil_medico"] = null;
        let rolPerfil: RolUsuario | null = rol;
        try {
          const res = await fetch("/api/profile", { headers: autorizacion });
          if (res.ok) {
            const payload = (await res.json()) as PerfilRespuesta;
            perfil = payload.perfil ?? null;
            perfilMedico = payload.perfil_medico ?? null;
            rolPerfil = payload.rol ?? rol;
          }
        } catch {
          // La navegación se resuelve igual con el rol confirmado.
        }

        if (!activo) return;
        rutearPorRol(router, rolPerfil, perfil, perfilMedico);
      } catch (err) {
        console.error("[auth/callback] Error procesando el retorno de OAuth:", err);
        if (!activo) return;
        setEstado("error");
        setMensajeError(
          err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado al completar el acceso.",
        );
      }
    })();

    return () => {
      activo = false;
    };
  }, [modo, router, searchParams]);

  if (estado === "error") {
    const noRegistrado = tipoError === "no-registrado";
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm mx-auto text-center">
        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="text-amber-500" size={22} />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">
          {noRegistrado ? "Gmail no encontrado" : "No pudimos completar el acceso"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">{mensajeError ?? "Error inesperado."}</p>
        <div className="flex flex-col gap-2">
          {noRegistrado ? (
            <button
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
              disabled={creandoCuenta}
              onClick={() => void iniciarRegistroConGoogle()}
            >
              {creandoCuenta ? <Loader2 className="animate-spin" size={14} /> : <UserPlus size={14} />}
              {creandoCuenta ? "Abriendo Google…" : "Crear cuenta con Google"}
            </button>
          ) : (
            <button
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
              onClick={() => window.location.assign(window.location.href)}
            >
              <RefreshCw size={14} /> Reintentar
            </button>
          )}
          <Link
            className="flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-lg transition-colors"
            href="/"
          >
            <Home size={14} /> Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-sm font-semibold text-gray-600">Preparando tu acceso…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
