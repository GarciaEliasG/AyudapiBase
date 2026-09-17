export const GRUPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const GENEROS = ["Masculino", "Femenino", "No binario", "Prefiero no decir"] as const;

export const CAMPOS_OBLIGATORIOS_PERFIL = [
  { key: "alias", label: "Alias público" },
  { key: "fecha_nacimiento", label: "Fecha de nacimiento" },
  { key: "genero", label: "Género" },
  { key: "grupo_sanguineo", label: "Grupo sanguíneo" },
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esEmailValido(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

const ISO_FECHA_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const FECHA_LOCAL_REGEX = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
const MARCA_HORA_REGEX = /[Tt]/;

function recortarMarcaHora(fecha: string): string {
  const indice = fecha.search(MARCA_HORA_REGEX);
  if (indice === -1) {
    return fecha;
  }
  return fecha.slice(0, indice);
}

export function normalizarFecha(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return null;
  }
  const limpio = valor.trim();
  if (!limpio) {
    return null;
  }

  let iso = limpio;
  const local = FECHA_LOCAL_REGEX.exec(limpio);
  if (local) {
    iso = `${local[3]}-${local[2]}-${local[1]}`;
  } else {
    iso = recortarMarcaHora(limpio);
  }
  if (!ISO_FECHA_REGEX.test(iso)) {
    return null;
  }
  return iso;
}

export function esFechaValida(fecha: unknown): boolean {
  const iso = normalizarFecha(fecha);
  if (!iso) {
    return false;
  }
  const [, anioStr, mesStr, diaStr] = ISO_FECHA_REGEX.exec(iso) ?? [];
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return false;
  }
  const date = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    date.getUTCFullYear() !== anio ||
    date.getUTCMonth() !== mes - 1 ||
    date.getUTCDate() !== dia
  ) {
    return false;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  if (iso < "1900-01-01" || iso > hoy) {
    return false;
  }
  return true;
}

export function esGrupoSanguineoValido(grupo: unknown): boolean {
  return typeof grupo === "string" && (GRUPOS_SANGUINEOS as readonly string[]).includes(grupo.trim());
}

export function esGeneroValido(genero: unknown): boolean {
  return typeof genero === "string" && (GENEROS as readonly string[]).includes(genero.trim());
}

export function esCuitValido(cuit: string): boolean {
  const digitos = cuit.replace(/\D/g, "");
  return digitos.length === 11;
}

/**
 * Estándar SISA/REFEPS — validación estricta de identidad y credenciales.
 * El DNI es obligatorio y debe ser exactamente 7 u 8 dígitos numéricos, sin
 * puntos, espacios ni letras. Nada de tolerancias: "30.123.456" o "ABC1234"
 * son inválidos y deben responder HTTP 400 con el campo detallado.
 */
export const DNI_REGEX_ESTRICTO = /^\d{7,8}$/;

export function esDniEstrictoValido(dni: unknown): boolean {
  if (typeof dni !== "string" && typeof dni !== "number") {
    return false;
  }
  return DNI_REGEX_ESTRICTO.test(String(dni).trim());
}

/**
 * Jurisdicciones emisoras reconocidas por SISA/REFEPS (canónico en
 * mayúsculas, sin acentos). El alta médica exige una de estas: "NACIONAL"
 * (matrícula nacional) o la provincia emisora.
 */
export const JURISDICCIONES_SISA = [
  "NACIONAL",
  "CABA",
  "BUENOS AIRES",
  "CATAMARCA",
  "CHACO",
  "CHUBUT",
  "CORDOBA",
  "CORRIENTES",
  "ENTRE RIOS",
  "FORMOSA",
  "JUJUY",
  "LA PAMPA",
  "LA RIOJA",
  "MENDOZA",
  "MISIONES",
  "NEUQUEN",
  "RIO NEGRO",
  "SALTA",
  "SAN JUAN",
  "SAN LUIS",
  "SANTA CRUZ",
  "SANTA FE",
  "SANTIAGO DEL ESTERO",
  "TIERRA DEL FUEGO",
  "TUCUMAN",
] as const;

export type JurisdiccionSisa = (typeof JURISDICCIONES_SISA)[number];

function sinAcentos(mayusculas: string): string {
  return mayusculas
    .replace(/Á/g, "A")
    .replace(/É/g, "E")
    .replace(/Í/g, "I")
    .replace(/Ó/g, "O")
    .replace(/Ú/g, "U")
    .replace(/Ü/g, "U");
}

/** Normaliza jurisdicción al canónico SISA (mayúsculas, sin acentos). */
export function normalizarJurisdiccionSisa(jurisdiccion: unknown): string | null {
  if (typeof jurisdiccion !== "string") {
    return null;
  }
  const limpio = sinAcentos(jurisdiccion.trim().toUpperCase()).replace(/\s+/g, " ");
  return limpio.length > 0 ? limpio : null;
}

/** `true` solo si la jurisdicción pertenece al padrón oficial SISA/REFEPS. */
export function esJurisdiccionSisaValida(jurisdiccion: unknown): boolean {
  const normalizada = normalizarJurisdiccionSisa(jurisdiccion);
  if (!normalizada) {
    return false;
  }
  return (JURISDICCIONES_SISA as readonly string[]).includes(normalizada);
}

/**
 * Matrícula profesional real (no de prueba): 4 a 8 dígitos, con o sin
 * prefijo de tipo (MN/MP/ME). Ej: "123456", "MN 123456", "MP-123456".
 * "MP 1234" cumple el formato pero igual debe pasar la verificación SISA;
 * el formato solo no habilita.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- prefijo opcional acotado + 4-8 dígitos: tiempo lineal, sin backtracking anidado.
export const MATRICULA_REAL_REGEX = /^(?:(?:MN|MP|ME)[\s.-]?)?[0-9]{4,8}$/;

export function esMatriculaRealValida(matricula: unknown): boolean {
  if (typeof matricula !== "string") {
    return false;
  }
  return MATRICULA_REAL_REGEX.test(matricula.trim().toUpperCase());
}

/** Matrícula de prueba del bypass (`TEST-...`, 1 a 20 alfanuméricos/guiones). */
export const MATRICULA_PRUEBA_REGEX = /^TEST-[A-Z0-9-]{1,20}$/;

export function esMatriculaPruebaValida(matricula: unknown): boolean {
  if (typeof matricula !== "string") {
    return false;
  }
  return MATRICULA_PRUEBA_REGEX.test(matricula.trim().toUpperCase());
}

/**
 * Teléfono de contacto argentino: se admiten `+`, espacios, guiones,
 * paréntesis y puntos, pero debe contener entre 8 y 15 dígitos.
 */
export function esTelefonoValido(telefono: unknown): boolean {
  if (typeof telefono !== "string" && typeof telefono !== "number") {
    return false;
  }
  const texto = String(telefono).trim();
  if (!/^[+\d][\d\s()./-]*$/.test(texto)) {
    return false;
  }
  const digitos = texto.replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 15;
}

export function normalizarTelefono(telefono: unknown): string | null {
  if (typeof telefono !== "string" && typeof telefono !== "number") {
    return null;
  }
  const texto = String(telefono).trim();
  return texto.length > 0 ? texto : null;
}

export function esMatriculaValida(matricula: string): boolean {
  const limpio = matricula.trim();
  if (limpio.length < 4) {
    return false;
  }
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s.\-/]+$/.test(limpio);
}

/** Normaliza matrícula para comparar/persistir (trim + mayúsculas). */
export function normalizarMatricula(matricula: unknown): string {
  return typeof matricula === "string" ? matricula.trim().toUpperCase() : "";
}

/** Matrículas de prueba del modo bypass (`TEST-...`, case-insensitive). */
export function esMatriculaDePrueba(matricula: unknown): boolean {
  if (typeof matricula !== "string") {
    return false;
  }
  return matricula.trim().toUpperCase().startsWith("TEST-");
}

/**
 * Jurisdicción emisora de la matrícula (opcional). Vacío = válido (no
 * informado). Con valor: 2 a 32 caracteres alfabéticos/espacios/puntos.
 */
export function esJurisdiccionValida(jurisdiccion: unknown): boolean {
  if (jurisdiccion === undefined || jurisdiccion === null) {
    return true;
  }
  if (typeof jurisdiccion !== "string") {
    return false;
  }
  const limpio = jurisdiccion.trim();
  if (limpio.length === 0) {
    return true;
  }
  if (limpio.length < 2 || limpio.length > 32) {
    return false;
  }
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s.\-/]+$/.test(limpio);
}

export function normalizarJurisdiccion(jurisdiccion: unknown): string | null {
  if (typeof jurisdiccion !== "string") {
    return null;
  }
  const limpio = jurisdiccion.trim().toUpperCase();
  return limpio.length > 0 ? limpio : null;
}

/**
 * DNI argentino (opcional). Vacío = válido (no informado). Con valor: 7 u 8
 * dígitos (se toleran puntos/espacios/guiones al ingresarlo).
 */
export function esDniValido(dni: unknown): boolean {
  if (dni === undefined || dni === null) {
    return true;
  }
  if (typeof dni !== "string" && typeof dni !== "number") {
    return false;
  }
  const digitos = String(dni).replace(/\D/g, "");
  if (digitos.length === 0) {
    return true;
  }
  return digitos.length === 7 || digitos.length === 8;
}

export function normalizarDni(dni: unknown): string | null {
  if (typeof dni !== "string" && typeof dni !== "number") {
    return null;
  }
  const digitos = String(dni).replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

/**
 * Detecta valores provisorios de matrícula que no identifican a un profesional
 * real: cadenas vacías, el histórico "S/M" y los generados "PENDIENTE-XXXXXXXX".
 * Como `matricula` es UNIQUE en base de datos, estos valores nunca deben
 * persistirse para más de un usuario.
 */
export function esMatriculaProvisoria(matricula: unknown): boolean {
  if (typeof matricula !== "string") {
    return true;
  }
  const limpio = matricula.trim();
  if (limpio.length === 0) {
    return true;
  }
  const minusculas = limpio.toLowerCase();
  return minusculas === "s/m" || minusculas.startsWith("pendiente-");
}

/**
 * Genera una matrícula provisoria única por usuario para el alta inicial. Se
 * reemplaza por la matrícula real en la vinculación o el completado de perfil.
 */
export function matriculaProvisoriaPara(usuarioId: string): string {
  const base = usuarioId.replace(/-/g, "").slice(0, 8).toUpperCase() || "XXXXXXXX";
  return `PENDIENTE-${base}`;
}

export function validarPerfilObligatorios(perfil: {
  alias?: unknown;
  fecha_nacimiento?: unknown;
  genero?: unknown;
  grupo_sanguineo?: unknown;
}): string[] {
  const errores: string[] = [];

  const alias = typeof perfil.alias === "string" ? perfil.alias.trim() : "";
  if (alias.length < 2) {
    errores.push("El alias es obligatorio y debe tener al menos 2 caracteres.");
  }

  if (!esFechaValida(perfil.fecha_nacimiento)) {
    errores.push("La fecha de nacimiento es obligatoria y debe ser una fecha válida.");
  }

  if (!esGeneroValido(perfil.genero)) {
    errores.push("El género es obligatorio y debe ser una opción válida.");
  }

  if (!esGrupoSanguineoValido(perfil.grupo_sanguineo)) {
    errores.push("El grupo sanguíneo es obligatorio y debe ser una opción válida.");
  }

  return errores;
}

export function perfilPacienteCompleto(perfil: {
  alias?: unknown;
  fecha_nacimiento?: unknown;
  genero?: unknown;
  grupo_sanguineo?: unknown;
}): boolean {
  return validarPerfilObligatorios(perfil).length === 0;
}

/**
 * Valida que el perfil del médico tenga los datos obligatorios para operar de
 * manera auditada: matrícula real (no valores provisorios como "S/M" o
 * "PENDIENTE-XXXXXXXX"), especialidad y teléfono de contacto.
 */
export function perfilMedicoCompleto(perfil: {
  especialidad?: unknown;
  matricula?: unknown;
  telefono_contacto?: unknown;
}): boolean {
  const matricula =
    typeof perfil.matricula === "string" ? perfil.matricula.trim() : "";
  const especialidad =
    typeof perfil.especialidad === "string" ? perfil.especialidad.trim() : "";
  const telefono =
    typeof perfil.telefono_contacto === "string"
      ? perfil.telefono_contacto.trim()
      : "";

  if (esMatriculaProvisoria(matricula)) {
    return false;
  }
  if (!esMatriculaValida(matricula)) {
    return false;
  }
  if (especialidad.length < 3) {
    return false;
  }
  return telefono.replace(/\D/g, "").length >= 8;
}