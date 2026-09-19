"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Heart,
  Loader2,
  Lock,
  Phone,
  Plus,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import type {
  CondicionMedica,
  ContactoEmergencia,
  Medicamento,
  PerfilPacienteInput,
} from "@/lib/supabase/database";

import { LoginModal } from "@/components/auth/login-modal";
import { StudyManager } from "@/components/estudios/study-manager";
import { StepIndicator } from "@/components/shared/step-indicator";
import { Toggle } from "@/components/shared/toggle";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";
import { esDniEstrictoValido, esFechaValida, esGeneroValido, esGrupoSanguineoValido, normalizarFecha } from "@/lib/validation/profile";

type Severidad = "Crítico" | "Moderado" | "Leve";

interface Condition {
  descripcion: string;
  id: number;
  severidad: Severidad;
  tipo: string;
}
interface Medication {
  dosis: string;
  frecuencia: string;
  id: number;
  nombre: string;
}
interface Contact {
  id: number;
  nombre: string;
  relacion: string;
  telefono: string;
}

const INPUT_CLASS =
  "w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

const SEV_COLOR: Record<Severidad, string> = {
  Crítico: "text-red-700 bg-red-50 border-red-300",
  Moderado: "text-amber-700 bg-amber-50 border-amber-200",
  Leve: "text-blue-700 bg-blue-50 border-blue-200",
};

export default function CreateProfilePage() {
  const router = useRouter();
  const { session } = useSession();
  const [showLogin, setShowLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [alias, setAlias] = useState("");
  const [dni, setDni] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [contactos, setContactos] = useState<Contact[]>([
    { id: 1, nombre: "", relacion: "", telefono: "" },
  ]);
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("");
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("70");

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [condTipo, setCondTipo] = useState("Enfermedad crónica");
  const [condSev, setCondSev] = useState<Severidad>("Crítico");
  const [condDesc, setCondDesc] = useState("");

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medFreq, setMedFreq] = useState("");
  const [medNotes, setMedNotes] = useState("");

  const [shareLocation, setShareLocation] = useState(true);
  const [publicProfile, setPublicProfile] = useState(true);
  const [medAccess, setMedAccess] = useState(true);
  const [obraReports, setObraReports] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reintentarKey, setReintentarKey] = useState(0);

  const wizardListo = !loading || !session;
  const cargandoPerfil = loading && Boolean(session);

  useEffect(() => {
    let activo = true;
    if (!session) {
      return () => {
        activo = false;
      };
    }
    apiFetch<{
      perfil: {
        alergias: CondicionMedica[] | null;
        alias: string;
        altura_cm: number | null;
        contactos_emergencia: ContactoEmergencia[];
        dni: string | null;
        fecha_nacimiento: string | null;
        genero: string | null;
        grupo_sanguineo: string | null;
        med_access: boolean | null;
        medicacion: Medicamento[] | null;
        nombre_completo: string | null;
        notas_medicas: string | null;
        obra_reports: boolean | null;
        patologias: CondicionMedica[] | null;
        peso_kg: number | null;
        public_profile: boolean | null;
        share_location: boolean | null;
      } | null;
    }>("/api/profile", session)
      .then(({ perfil }) => {
        if (!activo) {
          return;
        }
        if (!perfil) {
          return;
        }
        setError(null);
        const fechaNacimiento = normalizarFecha(perfil.fecha_nacimiento) ?? "";
        setAlias(perfil.alias.trim());
        setDni((perfil.dni ?? "").trim());
        setFullName((perfil.nombre_completo ?? "").trim());
        setBirthDate(fechaNacimiento);
        setGender((perfil.genero ?? "").trim());
        setBloodGroup((perfil.grupo_sanguineo ?? "").trim());
        setHeight(perfil.altura_cm?.toString() ?? "170");
        setWeight(perfil.peso_kg?.toString() ?? "70");
        setMedNotes(perfil.notas_medicas ?? "");

        const alergias: Condition[] = (perfil.alergias ?? []).map((c, i) => ({
          descripcion: c.descripcion,
          id: Date.now() + i,
          severidad: c.severidad,
          tipo: c.tipo || "Alergia",
        }));
        const patologias: Condition[] = (perfil.patologias ?? []).map((c, i) => ({
          descripcion: c.descripcion,
          id: Date.now() + i + 1000,
          severidad: c.severidad,
          tipo: c.tipo || "Enfermedad crónica",
        }));
        setConditions([...alergias, ...patologias]);

        setMedications(
          (perfil.medicacion ?? []).map((m, i) => ({
            dosis: m.dosis,
            frecuencia: m.frecuencia,
            id: Date.now() + i,
            nombre: m.nombre,
          })),
        );

        setContactos(
          perfil.contactos_emergencia.length > 0
            ? perfil.contactos_emergencia.map((c, i) => ({
                id: Date.now() + i,
                nombre: c.nombre,
                relacion: c.relacion,
                telefono: c.telefono,
              }))
            : [{ id: 1, nombre: "", relacion: "", telefono: "" }],
        );

        setShareLocation(perfil.share_location ?? true);
        setPublicProfile(perfil.public_profile ?? true);
        setMedAccess(perfil.med_access ?? true);
        setObraReports(perfil.obra_reports ?? false);
      })
      .catch((err) => {
        if (!activo) {
          return;
        }
        const esAuth = err instanceof ApiError && (err.status === 401 || err.status === 403);
        setLoadError(
          err instanceof Error && !esAuth
            ? `No se pudo cargar tu perfil: ${err.message}.`
            : "Tu sesión expiró. Iniciá sesión nuevamente.",
        );
      })
      .finally(() => {
        if (activo) {
          setLoading(false);
        }
      });
    return () => {
      activo = false;
    };
  }, [reintentarKey, session]);

  function addCondition() {
    if (!condDesc.trim()) return;
    setConditions((prev) => [
      ...prev,
      { descripcion: condDesc, id: Date.now(), severidad: condSev, tipo: condTipo },
    ]);
    setCondDesc("");
  }
  function removeCondition(id: number) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }
  function addMedication() {
    if (!medName.trim()) return;
    setMedications((prev) => [
      ...prev,
      { dosis: medDose, frecuencia: medFreq, id: Date.now(), nombre: medName },
    ]);
    setMedName("");
    setMedDose("");
    setMedFreq("");
  }
  function removeMedication(id: number) {
    setMedications((prev) => prev.filter((m) => m.id !== id));
  }
  function addContact() {
    setContactos((prev) => [...prev, { id: Date.now(), nombre: "", relacion: "", telefono: "" }]);
  }
  function updateContact(id: number, field: keyof Contact, value: string) {
    setContactos((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }

  function buildPayload(): PerfilPacienteInput {
    const alergias = conditions
      .filter((c) => c.tipo === "Alergia")
      .map<CondicionMedica>((c) => ({ descripcion: c.descripcion, severidad: c.severidad, tipo: c.tipo }));
    const patologias = conditions
      .filter((c) => c.tipo !== "Alergia")
      .map<CondicionMedica>((c) => ({ descripcion: c.descripcion, severidad: c.severidad, tipo: c.tipo }));
    const medicacion = medications.map<Medicamento>((m) => ({
      dosis: m.dosis,
      frecuencia: m.frecuencia,
      nombre: m.nombre,
    }));
    return {
      alergias,
      alias: alias.trim(),
      altura_cm: height ? Number(height) : null,
      dni: dni.trim(),
      contactos_emergencia: contactos
        .filter((c) => c.nombre.trim() && c.telefono.trim())
        .map<ContactoEmergencia>((c) => ({
          nombre: c.nombre,
          relacion: c.relacion,
          telefono: c.telefono,
        })),
      fecha_nacimiento: normalizarFecha(birthDate),
      genero: gender.trim() || null,
      grupo_sanguineo: bloodGroup.trim() || null,
      med_access: medAccess,
      medicacion,
      nombre_completo: fullName || null,
      notas_medicas: medNotes.trim() ? medNotes : null,
      obra_reports: obraReports,
      patologias,
      peso_kg: weight ? Number(weight) : null,
      public_profile: publicProfile,
      share_location: shareLocation,
    };
  }

  async function handleSave() {
    setError(null);
    if (!session) {
      setShowLogin(true);
      return;
    }
    const faltantes = camposObligatoriosFaltantes();
    if (faltantes.length > 0) {
      setError(`Completá los campos obligatorios antes de continuar: ${faltantes.join(", ")}.`);
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/profile", session, {
        body: JSON.stringify(buildPayload()),
        method: "PUT",
      });
      router.push("/qr-exito");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  function camposObligatoriosFaltantes(): string[] {
    const faltantes: string[] = [];
    if (alias.trim().length < 2) {
      faltantes.push("alias");
    }
    if (!esDniEstrictoValido(dni)) {
      faltantes.push("DNI (7 u 8 dígitos, sin puntos)");
    }
    if (!esFechaValida(birthDate)) {
      faltantes.push("fecha de nacimiento");
    }
    if (!esGeneroValido(gender)) {
      faltantes.push("género");
    }
    if (!esGrupoSanguineoValido(bloodGroup)) {
      faltantes.push("grupo sanguíneo");
    }
    return faltantes;
  }

  function irSiguiente() {
    if (!session) {
      setShowLogin(true);
      return;
    }
    if (step === 1) {
      const faltantes = camposObligatoriosFaltantes();
      if (faltantes.length > 0) {
        setError(`Completá los campos obligatorios: ${faltantes.join(", ")}.`);
        return;
      }
    }
    setError(null);
    setStep(step + 1);
  }

  function headerBack() {
    if (step === 1) {
      router.push("/");
    } else {
      setStep(step - 1);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center gap-3 h-14">
          <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={headerBack}>
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <Heart className="text-white fill-white" size={12} />
            </div>
            <span className="font-black text-gray-900 text-base">AyudAPI</span>
          </div>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-gray-500 text-sm">Crear perfil médico</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {wizardListo && (
          <StepIndicator current={step} />
        )}

        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <User className="text-blue-600" size={18} />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Datos personales</h2>
                <p className="text-sm text-gray-500">Tu información básica para identificación en emergencia</p>
                <p className="text-xs text-blue-600 font-medium mt-1">* Campos obligatorios: no podés continuar sin completarlos.</p>
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Alias público <span className="text-blue-600">*</span></label>
                <p className="text-xs text-gray-400 mb-1.5">Nombre que verá quien te asista. Puede ser solo tu nombre de pila por privacidad.</p>
                <input className={INPUT_CLASS} onChange={(e) => setAlias(e.target.value)} placeholder="Ej: Carlos M. o simplemente Carlos" type="text" value={alias} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-700">Nombre completo</label>
                  <span className="text-xs text-blue-600">Cifrado · solo médicos autorizados</span>
                </div>
                <input className={INPUT_CLASS} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre legal completo" type="text" value={fullName} />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">DNI <span className="text-blue-600">*</span></label>
                <p className="text-xs text-gray-400 mb-1.5">7 u 8 dígitos, sin puntos ni letras. Una sola cuenta por DNI.</p>
                <input className={INPUT_CLASS} inputMode="numeric" maxLength={8} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Ej: 30123456" type="text" value={dni} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Fecha de nacimiento <span className="text-blue-600">*</span></label>
                  <input className={INPUT_CLASS} onChange={(e) => setBirthDate(e.target.value)} type="date" value={birthDate} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Género <span className="text-blue-600">*</span></label>
                  <select className={INPUT_CLASS} onChange={(e) => setGender(e.target.value)} value={gender}>
                    <option value="">Seleccionar</option>
                    <option>Masculino</option>
                    <option>Femenino</option>
                    <option>No binario</option>
                    <option>Prefiero no decir</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Grupo sanguíneo <span className="text-blue-600">*</span></label>
                  <select className={INPUT_CLASS} onChange={(e) => setBloodGroup(e.target.value)} value={bloodGroup}>
                    <option value="">— Seleccionar —</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Altura (cm)</label>
                  <input className={INPUT_CLASS} onChange={(e) => setHeight(e.target.value)} placeholder="170" type="number" value={height} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Peso (kg)</label>
                  <input className={INPUT_CLASS} onChange={(e) => setWeight(e.target.value)} placeholder="70" type="number" value={weight} />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="text-amber-600" size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Condiciones y alergias críticas</h2>
                  <p className="text-sm text-amber-600 font-medium">Aparecerán destacadas en tu perfil de emergencia</p>
                </div>
              </div>
              <div className="border border-gray-100 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-gray-600 mb-3">Agregar condición</p>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <select className={INPUT_CLASS} onChange={(e) => setCondTipo(e.target.value)} value={condTipo}>
                    <option>Enfermedad crónica</option>
                    <option>Alergia</option>
                    <option>Condición cardíaca</option>
                    <option>Trastorno neurológico</option>
                    <option>Otra</option>
                  </select>
                  <select className={INPUT_CLASS} onChange={(e) => setCondSev(e.target.value as Severidad)} value={condSev}>
                    <option>Crítico</option>
                    <option>Moderado</option>
                    <option>Leve</option>
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className={INPUT_CLASS}
                    onChange={(e) => setCondDesc(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCondition()}
                    placeholder="Ej: PENICILINA — RIESGO DE ANAFILAXIA"
                    type="text"
                    value={condDesc}
                  />
                  <button className="w-full sm:w-9 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center justify-center gap-1.5 transition-colors flex-shrink-0" onClick={addCondition}>
                    <Plus size={16} />
                    <span className="sm:hidden text-sm font-semibold">Agregar</span>
                  </button>
                </div>
              </div>
              {conditions.map((c) => (
                <div className={cn("flex items-center justify-between border rounded-lg px-3 py-2 mb-2 text-sm", SEV_COLOR[c.severidad])} key={c.id}>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60">{c.tipo}</span>
                    <p className="font-semibold">{c.descripcion}</p>
                  </div>
                  <button className="opacity-40 hover:opacity-70" onClick={() => removeCondition(c.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Activity className="text-blue-600" size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Medicación actual</h2>
                  <p className="text-sm text-gray-500">Se almacena cifrada (Ley 25.326)</p>
                </div>
              </div>
              <div className="border border-dashed border-gray-200 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-gray-600 mb-3">Agregar medicamento</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input className={INPUT_CLASS} onChange={(e) => setMedName(e.target.value)} placeholder="Nombre del medicamento" type="text" value={medName} />
                  <input className={cn(INPUT_CLASS, "w-full sm:w-28")} onChange={(e) => setMedDose(e.target.value)} placeholder="Dosis (ej: 50mg)" type="text" value={medDose} />
                  <input className={cn(INPUT_CLASS, "w-full sm:w-28")} onChange={(e) => setMedFreq(e.target.value)} placeholder="Frecuencia" type="text" value={medFreq} />
                  <button className="w-full sm:w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-1.5 transition-colors flex-shrink-0" onClick={addMedication}>
                    <Plus size={16} />
                    <span className="sm:hidden text-sm font-semibold">Agregar</span>
                  </button>
                </div>
              </div>
              {medications.map((m) => (
                <div className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 mb-2 text-sm" key={m.id}>
                  <div>
                    <span className="font-semibold text-gray-900">{m.nombre}</span>
                    {m.dosis && <span className="text-gray-500 ml-2">· {m.dosis}</span>}
                    {m.frecuencia && <span className="text-gray-400 ml-2">· {m.frecuencia}</span>}
                  </div>
                  <button className="text-gray-300 hover:text-gray-500" onClick={() => removeMedication(m.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <FileText className="text-violet-600" size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Notas para el personal médico</h2>
                  <p className="text-sm text-blue-500">Solo visible para médicos y paramédicos certificados</p>
                </div>
              </div>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
                onChange={(e) => setMedNotes(e.target.value)}
                placeholder="Ej: En caso de inconsciencia NO administrar insulina. Verificar glucemia antes de cualquier intervención..."
                rows={4}
                value={medNotes}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <Phone className="text-green-600" size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Contactos de emergencia</h2>
                  <p className="text-sm text-gray-500">Serán alertados con tu ubicación si se activa una alarma</p>
                </div>
              </div>
              {contactos.map((contact, idx) => (
                <div className={cn("rounded-xl p-4 mb-3", idx === 0 ? "bg-blue-50 border border-blue-100" : "bg-gray-50 border border-gray-100")} key={contact.id}>
                  <p className="text-xs font-bold text-blue-600 mb-3">{idx === 0 ? "Contacto principal (ICE)" : `Contacto adicional ${idx + 1}`}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre completo</label>
                      <input className={INPUT_CLASS} onChange={(e) => updateContact(contact.id, "nombre", e.target.value)} placeholder="María González" type="text" value={contact.nombre} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Relación</label>
                      <input className={INPUT_CLASS} onChange={(e) => updateContact(contact.id, "relacion", e.target.value)} placeholder="Esposa / Hijo / Médico..." type="text" value={contact.relacion} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Teléfono de contacto</label>
                    <input className={INPUT_CLASS} onChange={(e) => updateContact(contact.id, "telefono", e.target.value)} placeholder="+54 11 XXXX-XXXX" type="tel" value={contact.telefono} />
                  </div>
                </div>
              ))}
              <button className="w-full border border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5" onClick={addContact}>
                <Plus size={14} /> Agregar otro contacto
              </button>
            </div>

            <StudyManager />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <Lock className="text-violet-600" size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Permisos y privacidad</h2>
                  <p className="text-sm text-blue-500">Controlá qué información compartís y con quién</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { checked: shareLocation, key: "shareLocation", locked: true, onChange: setShareLocation, title: "Compartir ubicación en emergencias", desc: "Al presionar el botón de alerta, se enviará tu ubicación GPS al SAME y tus contactos ICE." },
                  { checked: publicProfile, key: "publicProfile", locked: true, onChange: setPublicProfile, title: "Perfil público de emergencia", desc: "Cualquier persona con tu QR puede ver tu alias, condiciones críticas y contactos ICE." },
                  { checked: medAccess, key: "medAccess", locked: false, onChange: setMedAccess, title: "Acceso ampliado para médicos certificados", desc: "Los médicos y paramédicos con matrícula verificada pueden acceder a tu historial completo." },
                  { checked: obraReports, key: "obraReports", locked: false, onChange: setObraReports, title: "Reportes a obra social (anonimizado)", desc: "Permite que tu obra social reciba datos de siniestralidad anónimos para mejorar la cobertura." },
                ].map(({ checked, key, locked, onChange, title, desc }) => (
                  <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-50 last:border-0" key={key}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900">{title}</span>
                        {locked && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Requerido</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                    <Toggle checked={checked} disabled={locked} onChange={onChange} />
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Autorización legal:</strong> Al registrarte en AyudAPI autorizás expresamente a que cualquier persona que encuentre tu código QR en tu persona revise tus pertenencias en caso de emergencia, conforme el Art. 34 del Código Penal (Estado de Necesidad) y el Art. 108 (Obligación de Socorro). Ley 25.326.
                </p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
              <h3 className="font-bold text-gray-900 mb-1">Vista previa de tu QR</h3>
              <p className="text-sm text-blue-500 mb-5">Al confirmar, se generará tu QR único y seguro</p>
              <div className="inline-block p-3 border border-gray-100 rounded-xl opacity-40 grayscale">
                <QRCodeSVG size={120} value="https://ayudapi.ar/e/preview" />
              </div>
              <p className="text-xs text-gray-400 mt-3">El QR final se genera al guardar tu perfil</p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
            {error}
          </p>
        )}

        {loadError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mt-4">
            <p className="text-sm text-amber-700 font-medium">{loadError}</p>
            <p className="text-xs text-amber-700/70 mt-0.5">
              No se modificó ningún dato. Reintentá la carga antes de continuar.
            </p>
            <button
              className="mt-2 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              onClick={() => {
              setLoading(true);
              setLoadError(null);
              setReintentarKey((k) => k + 1);
            }}
            >
              <RefreshCw size={14} /> Reintentar carga
            </button>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pb-8">
          <button className="flex items-center justify-center sm:justify-start gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2" onClick={headerBack}>
            <ChevronLeft size={16} />
            {step === 1 ? "Volver al inicio" : "Anterior"}
          </button>
          {step < 4 ? (
            <button
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors w-full sm:w-auto"
              disabled={cargandoPerfil || Boolean(loadError)}
              onClick={irSiguiente}
            >
              {loading && <Loader2 className="animate-spin" size={15} />}
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors w-full sm:w-auto"
              disabled={cargandoPerfil || saving || Boolean(loadError)}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              Guardar y generar QR
            </button>
          )}
        </div>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}