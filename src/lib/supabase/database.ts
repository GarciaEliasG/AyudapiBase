export type RolUsuario = "paciente" | "medico" | "institucion" | "admin";

export interface RolesUsuarioRow {
  id: string;
  usuario_id: string;
  rol: RolUsuario;
  creado_en: string;
}

export interface CondicionMedica {
  tipo: string;
  severidad: "Crítico" | "Moderado" | "Leve";
  descripcion: string;
}

export interface Medicamento {
  nombre: string;
  dosis: string;
  frecuencia: string;
}

export interface ContactoEmergencia {
  nombre: string;
  relacion: string;
  telefono: string;
}

export interface PerfilPacienteRow {
  id: string;
  usuario_id: string;
  alias: string;
  dni: string | null;
  telefono_contacto: string | null;
  nombre_completo: string | null;
  fecha_nacimiento: string | null;
  genero: string | null;
  grupo_sanguineo: string | null;
  altura_cm: number | null;
  peso_kg: number | null;
  alergias: unknown[] | null;
  patologias: unknown[] | null;
  medicacion: string | null;
  notas_medicas: string | null;
  contactos_emergencia: ContactoEmergencia[] | null;
  slug_qr: string | null;
  qr_activo: boolean;
  share_location: boolean;
  public_profile: boolean;
  med_access: boolean;
  obra_reports: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface PerfilPacienteInput {
  alias?: string;
  dni?: string | null;
  telefono_contacto?: string | null;
  nombre_completo?: string | null;
  fecha_nacimiento?: string | null;
  genero?: string | null;
  grupo_sanguineo?: string | null;
  altura_cm?: number | null;
  peso_kg?: number | null;
  alergias?: CondicionMedica[];
  patologias?: CondicionMedica[];
  medicacion?: Medicamento[];
  notas_medicas?: string | null;
  contactos_emergencia?: ContactoEmergencia[];
  share_location?: boolean;
  public_profile?: boolean;
  med_access?: boolean;
  obra_reports?: boolean;
}

export interface TokenQrRow {
  id: string;
  paciente_id: string;
  slug: string;
  url_publica: string;
  activo: boolean;
  creado_en: string;
  revocado_en: string | null;
}

export interface PacienteInstitucionRow {
  id: string;
  paciente_id: string;
  institucion_id: string;
  obra_social: string | null;
  nro_afilado: string | null;
  validado: boolean;
  creado_en: string;
}

export interface PerfilMedicoRow {
  dni?: string | null;
  especialidad: string | null;
  estado_verificacion?: string | null;
  id: string;
  institucion_id: string | null;
  jurisdiccion?: string | null;
  matricula: string;
  telefono_contacto: string | null;
  usuario_id: string;
  creado_en: string;
}

export interface PerfilInstitucionRow {
  id: string;
  usuario_id: string;
  nombre: string;
  cuit: string | null;
  direccion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  documentacion: unknown[] | null;
  creado_en: string;
}

export type TipoEstudio =
  | "ECG"
  | "LABORATORIO"
  | "RADIOGRAFIA"
  | "RESONANCIA"
  | "TOMOGRAFIA"
  | "OTRO";

export interface EstudioRow {
  id: string;
  paciente_id: string;
  medico_id: string | null;
  nombre_archivo: string;
  ruta_archivo: string;
  tamano_bytes: number | null;
  tipo_mime: string | null;
  tipo: string;
  descripcion: string | null;
  creado_en: string;
}

export interface EstudioConAcceso extends EstudioRow {
  url_acceso: string | null;
}

export interface LogsAuditoriaRow {
  id: string;
  usuario_id: string | null;
  paciente_id: string | null;
  institucion_id: string | null;
  accion: string;
  direccion_ip: string | null;
  detalles: unknown | null;
  creado_en: string;
}