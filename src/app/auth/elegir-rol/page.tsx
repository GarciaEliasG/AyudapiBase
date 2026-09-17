"use client";

import { AlertTriangle, Building2, Loader2, RefreshCw, ShieldCheck, Stethoscope, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import type { RolUsuario } from "@/lib/supabase/database";

import { ApiError, apiFetch } from "@/lib/api/client";
import { RUTA_DESTINO_KEY } from "@/lib/auth/destino";
import { esDestinoInternoValido, esRutaMedica } from "@/lib/auth/ruteo";
import { useSession } from "@/lib/auth/use-session";
import {
  esCuitValido,
  esDniEstrictoValido,
  esJurisdiccionSisaValida,
  esMatriculaDePrueba,
  esMatriculaRealValida,
  esTelefonoValido,
  JURISDICCIONES_SISA,
  perfilMedicoCompleto,
  perfilPacienteCompleto,
} from "@/lib/validation/profile";

type RolElegible = "institucion" | "medico" | "paciente";

interface EstadoRespuesta {
  email: string | null;
  rol: RolUsuario | null;
  roles: RolUsuario[];
}

interface PerfilVinculado {
  perfil?: {
    alias?: string | null;
    fecha_nacimiento?: string | null;
    genero?: string | null;
    grupo_sanguineo?: string | null;
  } | null;
  perfil_medico?: {
    especialidad?: string | null;
    matricula?: string | null;
    telefono_contacto?: string | null;
  } | null;
  rol?: RolUsuario | null;
}

const ROLES: Array<{ clave: RolElegible; descripcion: string; etiqueta: string }> = [
  { clave: "paciente", descripcion: "Tu QR de emergencia", etiqueta: "Paciente" },
  { clave: "medico", descripcion: "Panel clínico auditado", etiqueta: "Médico/a" },
  { clave: "institucion", descripcion: "Gestión de afiliados", etiqueta: "Institución" },
];

function iconoRol(clave: RolElegible) {
  if (clave === "medico") {
    return <Stethoscope size={18} />;
  }
  if (clave === "institucion") {
    return <Building2 size={18} />;
  }
  return <User size={18} />;
}

/**
 * Panel obligatorio de selección y vinculación de rol tras validar el email
 * con Google OAuth. Asocia formalmente la cuenta al rol elegido (Paciente,
 * Médico o Institución) y luego continúa al destino pendiente o al panel
 * correspondiente. Si la cuenta ya tenía roles, se la deriva sin pedir nada.
 */
function ElegirRolContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: cargandoSesion, session } = useSession();

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [rol, setRol] = useState<RolElegible>("paciente");
  const [alias, setAlias] = useState("");
  const [cuit, setCuit] = useState("");
  const [dni, setDni] = useState("");
  const [documentacion, setDocumentacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [especialidad, setEspecialidad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(0);
  const [jurisdiccion, setJurisdiccion] = useState("");
  const [matricula, setMatricula] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [nombreInstitucion, setNombreInstitucion] = useState("");
  const [telefono, setTelefono] = useState("");

  const destino =
    searchParams.get("destino") ??
    (typeof window === "undefined" ? null : window.sessionStorage.getItem(RUTA_DESTINO_KEY));

  const enrutar = useCallback(
    async (token: string, rolBase: RolUsuario | null) => {
      let perfil: PerfilVinculado["perfil"] = null;
      let perfilMedico: PerfilVinculado["perfil_medico"] = null;
      let rolFinal: RolUsuario | null = rolBase;
      try {
        const res = await fetch("/api/profile", {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const payload = (await res.json()) as PerfilVinculado;
          perfil = payload.perfil ?? null;
          perfilMedico = payload.perfil_medico ?? null;
          rolFinal = payload.rol ?? rolBase;
        }
      } catch {
        // Se enruta igual con el rol conocido.
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
      }
      if (rolFinal === "medico" && perfilMedico && !perfilMedicoCompleto(perfilMedico)) {
        router.replace("/medico/completar-perfil");
        return;
      }
      // Destino del panel médico sin rol médico: se ignora y se cae al panel
      // por rol en lugar de chocar con un 403.
      const destinoAplicable =
        esRutaMedica(destino) && rolFinal !== "medico" && rolFinal !== "admin"
          ? null
          : destino;
      if (esDestinoInternoValido(destinoAplicable, "/auth/elegir-rol")) {
        router.replace(destinoAplicable);
        return;
      }
      if (rolFinal === "institucion") {
        router.replace("/institucional");
        return;
      }
      if (rolFinal === "medico") {
        router.replace("/medico/escanear");
        return;
      }
      router.replace(perfilPacienteCompleto(perfil ?? {}) ? "/mi-perfil" : "/crear-perfil");
    },
    [destino, router],
  );

  useEffect(() => {
    if (cargandoSesion) {
      return;
    }
    if (!session) {
      router.replace("/");
      return;
    }
    let activo = true;
    apiFetch<EstadoRespuesta>("/api/auth/estado", session)
      .then((res) => {
        if (!activo) {
          return;
        }
        setEmail(res.email);
        // Cuenta con roles: se deriva a su panel, salvo que venga por un
        // destino médico sin rol médico (ahí sí se ofrece vincularlo).
        if (res.roles.length > 0) {
          const necesitaMedico =
            esRutaMedica(destino) && !res.roles.includes("medico") && !res.roles.includes("admin");
          if (!necesitaMedico) {
            void enrutar(session.access_token, res.rol);
            return;
          }
          setRol("medico");
        } else if (esRutaMedica(destino)) {
          setRol("medico");
        }
        setCargando(false);
      })
      .catch((err) => {
        if (activo) {
          setErrorCarga(err instanceof Error ? err.message : "No se pudo verificar tu cuenta.");
          setCargando(false);
        }
      });
    return () => {
      activo = false;
    };
  }, [cargandoSesion, destino, enrutar, intento, router, session]);

  function datosSegunRol(): Record<string, unknown> {
    if (rol === "medico") {
      return {
        dni: dni.trim() || undefined,
        especialidad: especialidad.trim() || undefined,
        jurisdiccion: jurisdiccion.trim() || undefined,
        matricula: matricula.trim() || undefined,
        telefono_contacto: telefono.trim() || undefined,
      };
    }
    if (rol === "institucion") {
      return {
        cuit: cuit.trim() || undefined,
        documentacion: documentacion.trim() || undefined,
        nombre: nombreInstitucion.trim() || undefined,
      };
    }
    return {
      alias: alias.trim() || undefined,
      dni: dni.trim() || undefined,
      nombre_completo: nombreCompleto.trim() || undefined,
    };
  }

  function validar(): string | null {
    if (!esDniEstrictoValido(dni)) {
      return "El DNI es obligatorio y debe tener exactamente 7 u 8 dígitos numéricos, sin puntos ni letras.";
    }
    if (rol === "medico") {
      const matriculaLimpia = matricula.trim();
      if (!esMatriculaRealValida(matriculaLimpia) && !esMatriculaDePrueba(matriculaLimpia)) {
        return "La matrícula profesional es obligatoria: 4 a 8 dígitos (con o sin prefijo MN/MP/ME).";
      }
      if (!esJurisdiccionSisaValida(jurisdiccion)) {
        return "La jurisdicción es obligatoria: seleccioná la emisora oficial (Nacional o provincia).";
      }
      if (especialidad.trim().length < 3) {
        return "La especialidad es obligatoria (mínimo 3 caracteres).";
      }
      if (!esTelefonoValido(telefono)) {
        return "El teléfono de contacto es obligatorio (8 a 15 dígitos).";
      }
      return null;
    }
    if (rol === "institucion") {
      if (nombreInstitucion.trim().length < 3) {
        return "El nombre de la institución es obligatorio.";
      }
      if (!esCuitValido(cuit)) {
        return "El CUIT debe tener 11 dígitos.";
      }
      if (documentacion.trim().length === 0) {
        return "La documentación de respaldo es obligatoria.";
      }
      return null;
    }
    return null;
  }

  async function vincular() {
    setError(null);
    const mensaje = validar();
    if (mensaje) {
      setError(mensaje);
      return;
    }
    if (!session) {
      setError("No hay sesión activa. Volvé a ingresar.");
      return;
    }
    setGuardando(true);
    try {
      const res = await apiFetch<{ rol: RolUsuario }>(
        "/api/auth/vincular-rol",
        session,
        {
          body: JSON.stringify({ datos: datosSegunRol(), rol }),
          method: "POST",
        },
      );
      await enrutar(session.access_token, res.rol);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo vincular el rol. Reintentá.",
      );
      setGuardando(false);
    }
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (cargandoSesion || cargando) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm font-semibold text-gray-600">Verificando tu cuenta…</p>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm mx-auto text-center w-full">
        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="text-amber-500" size={22} />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">No pudimos verificar tu cuenta</h1>
        <p className="text-sm text-gray-500 mb-6">{errorCarga}</p>
        <button
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
          onClick={() => {
            setCargando(true);
            setErrorCarga(null);
            setIntento((n) => n + 1);
          }}
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md mx-auto w-full">
      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <ShieldCheck className="text-emerald-600" size={22} />
      </div>
      <h1 className="text-xl font-extrabold text-gray-900 text-center mb-1">
        Elegí el rol de tu cuenta
      </h1>
      <p className="text-sm text-gray-500 text-center mb-1">
        Tu email ya quedó validado con Google. Asociá un rol para continuar.
      </p>
      {email && (
        <p className="text-xs text-gray-400 text-center mb-6">{email}</p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-5">
        {ROLES.map(({ clave, descripcion, etiqueta }) => (
          <button
            className={`rounded-xl px-2 py-3 text-xs font-semibold border transition-colors flex flex-col items-center gap-1 ${
              rol === clave
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            key={clave}
            onClick={() => {
              setRol(clave);
              setError(null);
            }}
            type="button"
          >
            {iconoRol(clave)}
            {etiqueta}
            <span className={`text-[10px] font-normal ${rol === clave ? "text-blue-100" : "text-gray-400"}`}>
              {descripcion}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3 mb-4">
        {rol === "paciente" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                DNI <span className="text-blue-600">*</span>
              </label>
              <input
                className={inputClass}
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Ej: 30123456 (7 u 8 dígitos, sin puntos)"
                type="text"
                value={dni}
              />
              <p className="text-xs text-gray-400 mt-1">Una sola cuenta por DNI. Si ya tenés cuenta, iniciá sesión.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nombre</label>
                <input
                  className={inputClass}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  placeholder="Nombre completo"
                  type="text"
                  value={nombreCompleto}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Alias</label>
                <input
                  className={inputClass}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Ej: Carlos"
                  type="text"
                  value={alias}
                />
              </div>
            </div>
          </div>
        )}

        {rol === "medico" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                DNI <span className="text-blue-600">*</span>
              </label>
              <input
                className={inputClass}
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Ej: 30123456 (7 u 8 dígitos, sin puntos)"
                type="text"
                value={dni}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Matrícula profesional <span className="text-blue-600">*</span>
                </label>
                <input
                  className={inputClass}
                  onChange={(e) => setMatricula(e.target.value)}
                  placeholder="MP 123456 / MN 789012"
                  type="text"
                  value={matricula}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Jurisdicción <span className="text-blue-600">*</span>
                </label>
                <select
                  className={inputClass}
                  onChange={(e) => setJurisdiccion(e.target.value)}
                  value={jurisdiccion}
                >
                  <option value="">Seleccionar</option>
                  {JURISDICCIONES_SISA.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">Tu credencial se verifica contra el padrón SISA/REFEPS. Sin coincidencia, el alta se bloquea.</p>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Especialidad <span className="text-blue-600">*</span>
              </label>
              <input
                className={inputClass}
                onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Clínica, Pediatría, Emergentología…"
                type="text"
                value={especialidad}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Teléfono de contacto <span className="text-blue-600">*</span>
              </label>
              <input
                className={inputClass}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+54 11 XXXX-XXXX"
                type="tel"
                value={telefono}
              />
            </div>
          </div>
        )}

        {rol === "institucion" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Nombre de la institución <span className="text-blue-600">*</span>
              </label>
              <input
                className={inputClass}
                onChange={(e) => setNombreInstitucion(e.target.value)}
                placeholder="Obra social o institución de salud"
                type="text"
                value={nombreInstitucion}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                CUIT <span className="text-blue-600">*</span>
              </label>
              <input
                className={inputClass}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="30-12345678-9"
                type="text"
                value={cuit}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Documentación de respaldo <span className="text-blue-600">*</span>
              </label>
              <textarea
                className={`${inputClass} resize-none`}
                onChange={(e) => setDocumentacion(e.target.value)}
                placeholder={"Una referencia por línea. Ej:\nHabilitación provincial Nº 4521\nInscripción registro RENIS"}
                rows={3}
                value={documentacion}
              />
              <p className="text-xs text-gray-400 mt-1">Constancias de habilitación, matrícula institucional, etc.</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <button
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        disabled={guardando}
        onClick={() => void vincular()}
      >
        {guardando && <Loader2 className="animate-spin" size={15} />}
        {guardando ? "Vinculando…" : "Continuar"}
      </button>
    </div>
  );
}

export default function ElegirRolPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}>
        <ElegirRolContenido />
      </Suspense>
    </div>
  );
}
