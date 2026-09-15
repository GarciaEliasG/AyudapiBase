"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/lib/api/client";
import { createBrowserClient } from "@/lib/supabase/browser";

interface LoginModalProps {
  onClose: () => void;
}

type RolRegistro = "institucion" | "medico" | "paciente";

const ROLES_REGISTRO: Array<{ clave: RolRegistro; etiqueta: string }> = [
  { clave: "paciente", etiqueta: "Paciente" },
  { clave: "medico", etiqueta: "Médico/a" },
  { clave: "institucion", etiqueta: "Institución" },
];

export function LoginModal({ onClose }: LoginModalProps) {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [cuit, setCuit] = useState("");
  const [documentacion, setDocumentacion] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [especialidad, setEspecialidad] = useState("");
  const [loading, setLoading] = useState(false);
  const [matricula, setMatricula] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nombre, setNombre] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<RolRegistro>("paciente");
  const [telefonoContacto, setTelefonoContacto] = useState("");

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await res.json()) as { error?: { message?: string }; url?: string };
      if (!res.ok || !payload.url) {
        throw new ApiError(res.status, payload.error?.message ?? "Error al iniciar con Google.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión.");
      setLoading(false);
    }
  }

  function validarRegistro(): string[] {
    const errores: string[] = [];
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      errores.push("email");
    }
    if (password.length < 8) {
      errores.push("contraseña (8+ caracteres)");
    }
    if (rol === "medico") {
      if (matricula.trim().length < 4) {
        errores.push("matrícula profesional");
      }
      if (especialidad.trim().length < 3) {
        errores.push("especialidad");
      }
    }
    if (rol === "institucion") {
      if (nombre.trim().length < 3) {
        errores.push("nombre de la institución");
      }
      if (cuit.replace(/\D/g, "").length !== 11) {
        errores.push("CUIT (11 dígitos)");
      }
      if (documentacion.trim().length === 0) {
        errores.push("documentación de respaldo");
      }
    }
    return errores;
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const errores = validarRegistro();
        if (errores.length > 0) {
          throw new ApiError(400, `Completá en la solicitud: ${errores.join(", ")}.`);
        }
        const res = await fetch("/api/auth/register", {
          body: JSON.stringify({
            alias: rol === "paciente" ? alias.trim() || undefined : undefined,
            cuit: rol === "institucion" ? cuit.trim() : undefined,
            documentacion:
              rol === "institucion"
                ? documentacion
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((l) => ({ referencia: l }))
                : undefined,
            email: email.trim(),
            especialidad: rol === "medico" ? especialidad.trim() : undefined,
            matricula: rol === "medico" ? matricula.trim() : undefined,
            nombre: rol === "institucion" ? nombre.trim() : undefined,
            nombre_completo: rol === "paciente" ? nombreCompleto.trim() || undefined : undefined,
            password,
            rol,
            telefono_contacto:
              rol === "medico" ? telefonoContacto.trim() || undefined : undefined,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) {
          throw new ApiError(res.status, payload.error?.message ?? "No se pudo crear la cuenta.");
        }
      }

      const { error: signInError } = await createBrowserClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        throw new ApiError(401, signInError.message);
      }
      if (mode === "register") {
        onClose();
        // Usuario nuevo: se lo dirige a la creación de su ficha médica.
        router.push(rol === "paciente" ? "/crear-perfil" : "/mi-perfil");
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión.");
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-8 relative shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          aria-label="Cerrar"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <span className="font-black text-xl text-gray-900">AyudAPI</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {mode === "login"
            ? "Accedé a tu perfil médico de emergencia"
            : "Registrate gratis. Tarda menos de 5 minutos."}
        </p>

        <div className="space-y-3 mb-4">
          {mode === "register" && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Tipo de cuenta</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES_REGISTRO.map(({ clave, etiqueta }) => (
                    <button
                      className={`rounded-lg px-2 py-2 text-xs font-semibold border transition-colors ${
                        rol === clave
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                      key={clave}
                      onClick={() => setRol(clave)}
                      type="button"
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>

              {rol === "paciente" && (
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
              )}

              {rol === "medico" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Matrícula profesional <span className="text-blue-600">*</span>
                    </label>
                    <input
                      className={inputClass}
                      onChange={(e) => setMatricula(e.target.value)}
                      placeholder="MP 123456 / ME 789012"
                      type="text"
                      value={matricula}
                    />
                  </div>
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
                    <label className="text-sm font-medium text-gray-700 block mb-1">Teléfono de contacto</label>
                    <input
                      className={inputClass}
                      onChange={(e) => setTelefonoContacto(e.target.value)}
                      placeholder="+54 11 XXXX-XXXX"
                      type="tel"
                      value={telefonoContacto}
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
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Obra social o institución de salud"
                      type="text"
                      value={nombre}
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
            </>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
            <input
              className={inputClass}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Contraseña</label>
            <input
              className={inputClass}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              value={password}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <button
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading && <Loader2 className="animate-spin" size={15} />}
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">o</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-4 disabled:opacity-60"
          disabled={loading}
          onClick={handleGoogle}
        >
          <svg height="18" viewBox="0 0 18 18" width="18">
            <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4" />
            <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" fill="#34A853" />
            <path d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" fill="#FBBC05" />
            <path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z" fill="#EA4335" />
          </svg>
          Continuar con Google
        </button>

        <p className="text-center text-sm text-gray-500">
          {mode === "login" ? (
            <>
              ¿No tenés cuenta?{" "}
              <button className="text-blue-600 font-medium hover:underline" onClick={() => setMode("register")}>
                Registrate gratis
              </button>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta?{" "}
              <button className="text-blue-600 font-medium hover:underline" onClick={() => setMode("login")}>
                Iniciá sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}