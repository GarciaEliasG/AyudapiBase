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

export function esMatriculaValida(matricula: string): boolean {
  const limpio = matricula.trim();
  if (limpio.length < 4) {
    return false;
  }
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s.\-/]+$/.test(limpio);
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