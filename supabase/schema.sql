-- =============================================================================
-- AYUDAPI · Esquema completo y seguro (Módulo DEV1 y DEV2)
-- =============================================================================

create extension if not exists postgis;

-- ── Enumerados ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_usuario_t') then
    create type rol_usuario_t as enum ('paciente', 'medico', 'institucion', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'severidad_t') then
    create type severidad_t as enum ('Crítico', 'Moderado', 'Leve');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_incidente_t') then
    create type estado_incidente_t as enum ('enviado', 'en_curso', 'resuelto', 'cancelado');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_estudio_t') then
    create type tipo_estudio_t as enum ('ECG', 'LABORATORIO', 'RADIOGRAFIA', 'RESONANCIA', 'TOMOGRAFIA', 'OTRO');
  end if;
end $$;

-- ── 1. roles_usuario ─────────────────────────────────────────────────────────
create table if not exists public.roles_usuario (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  rol        rol_usuario_t not null default 'paciente',
  creado_en  timestamptz not null default now(),
  unique (usuario_id, rol)
);

-- ── 2. perfiles_institucion ──────────────────────────────────────────────────
create table if not exists public.perfiles_institucion (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null unique references auth.users(id) on delete cascade,
  nombre         text not null,
  cuit           text,
  direccion      text,
  telefono       text,
  email_contacto text,
  documentacion  jsonb not null default '[]',
  creado_en      timestamptz not null default now()
);

-- ── 3. perfiles_paciente ─────────────────────────────────────────────────────
create table if not exists public.perfiles_paciente (
  id                   uuid primary key default gen_random_uuid(),
  usuario_id           uuid not null unique references auth.users(id) on delete cascade,
  alias                text not null default '',
  nombre_completo      text,
  fecha_nacimiento     date,
  genero               text,
  grupo_sanguineo      text,
  altura_cm            numeric(5, 2),
  peso_kg              numeric(5, 2),
  alergias             jsonb not null default '[]',
  patologias           jsonb not null default '[]',
  medicacion           text,
  notas_medicas        text,
  contactos_emergencia jsonb not null default '[]',
  slug_qr              text unique,
  qr_activo            boolean not null default false,
  share_location       boolean not null default true,
  public_profile       boolean not null default true,
  med_access           boolean not null default true,
  obra_reports         boolean not null default false,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

-- ── 4. perfiles_medico ───────────────────────────────────────────────────────
create table if not exists public.perfiles_medico (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null unique references auth.users(id) on delete cascade,
  matricula         text not null unique,
  especialidad      text,
  institucion_id    uuid references public.perfiles_institucion(id) on delete set null,
  telefono_contacto text,
  creado_en         timestamptz not null default now()
);

-- ── 5. pacientes_institucion ─────────────────────────────────────────────────
create table if not exists public.pacientes_institucion (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references public.perfiles_paciente(id) on delete cascade,
  institucion_id uuid not null references public.perfiles_institucion(id) on delete cascade,
  obra_social    text,
  nro_afilado    text,
  validado       boolean not null default false,
  creado_en      timestamptz not null default now(),
  unique (paciente_id, institucion_id)
);

-- ── 6. tokens_qr ─────────────────────────────────────────────────────────────
create table if not exists public.tokens_qr (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.perfiles_paciente(id) on delete cascade,
  slug        text not null unique,
  url_publica text not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  revocado_en timestamptz
);

-- ── 7. incidentes ────────────────────────────────────────────────────────────
create table if not exists public.incidentes (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid references public.perfiles_paciente(id) on delete cascade,
  tipo        text not null default 'same',
  estado      estado_incidente_t not null default 'enviado',
  lat         double precision,
  lng         double precision,
  ubicacion   geometry(Point, 4326),
  timestamp   timestamptz not null default now()
);

-- ── 8. escaneos_qr ───────────────────────────────────────────────────────────
create table if not exists public.escaneos_qr (
  id             uuid primary key default gen_random_uuid(),
  token_qr_id    uuid references public.tokens_qr(id) on delete set null,
  paciente_id    uuid references public.perfiles_paciente(id) on delete cascade,
  usuario_id     uuid references auth.users(id) on delete set null,
  rol_en_momento text,
  lat            double precision,
  lng            double precision,
  creado_en      timestamptz not null default now()
);

-- ── 9. atenciones ────────────────────────────────────────────────────────────
create table if not exists public.atenciones (
  id             uuid primary key default gen_random_uuid(),
  medico_id      uuid references public.perfiles_medico(id) on delete set null,
  paciente_id    uuid references public.perfiles_paciente(id) on delete cascade,
  incidente_id   uuid references public.incidentes(id) on delete set null,
  institucion_id uuid references public.perfiles_institucion(id) on delete set null,
  fecha_atencion timestamptz not null default now(),
  motivo         text,
  diagnostico    text,
  derivacion     text,
  creado_en      timestamptz not null default now()
);

-- ── 10. registros_medicos ────────────────────────────────────────────────────
create table if not exists public.registros_medicos (
  id                  uuid primary key default gen_random_uuid(),
  paciente_id         uuid not null references public.perfiles_paciente(id) on delete cascade,
  medico_id           uuid references public.perfiles_medico(id) on delete set null,
  grupo_sanguineo     text,
  medicacion_completa text,
  estudios            jsonb not null default '[]',
  observaciones       text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

-- ── 11. estudios ─────────────────────────────────────────────────────────────
create table if not exists public.estudios (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references public.perfiles_paciente(id) on delete cascade,
  medico_id      uuid references public.perfiles_medico(id) on delete set null,
  tipo           tipo_estudio_t not null default 'OTRO',
  descripcion    text,
  nombre_archivo text not null,
  ruta_archivo   text not null,
  tamano_bytes   bigint,
  tipo_mime      text,
  creado_en      timestamptz not null default now()
);

-- ── 12. notificaciones ───────────────────────────────────────────────────────
create table if not exists public.notificaciones (
  id           uuid primary key default gen_random_uuid(),
  incidente_id uuid references public.incidentes(id) on delete cascade,
  contacto     jsonb not null,
  canal        text not null default 'sms',
  estado       text not null default 'pendiente',
  creado_en    timestamptz not null default now()
);

-- ── 13. logs_auditoria ───────────────────────────────────────────────────────
create table if not exists public.logs_auditoria (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references auth.users(id) on delete set null,
  paciente_id    uuid references public.perfiles_paciente(id) on delete cascade,
  institucion_id uuid references public.perfiles_institucion(id) on delete set null,
  accion         text not null,
  direccion_ip   text,
  detalles       jsonb,
  creado_en      timestamptz not null default now()
);

-- =============================================================================
-- Funciones Transaccionales y de Seguridad
-- =============================================================================

create or replace function public.set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_perfiles_paciente_actualizado on public.perfiles_paciente;
create trigger trg_perfiles_paciente_actualizado
  before update on public.perfiles_paciente
  for each row execute function public.set_actualizado_en();

create or replace function public.crear_perfil_inicial(
  p_usuario_id uuid,
  p_rol rol_usuario_t,
  p_datos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles_usuario (usuario_id, rol)
  values (p_usuario_id, p_rol)
  on conflict (usuario_id, rol) do nothing;

  if p_rol = 'paciente' then
    insert into public.perfiles_paciente (usuario_id, alias, nombre_completo, fecha_nacimiento, genero, grupo_sanguineo)
    values (
      p_usuario_id,
      coalesce(p_datos->>'alias', p_datos->>'nombre_completo', 'Paciente'),
      p_datos->>'nombre_completo',
      nullif(p_datos->>'fecha_nacimiento', '')::date,
      p_datos->>'genero',
      p_datos->>'grupo_sanguineo'
    )
    on conflict (usuario_id) do update set
      alias = excluded.alias,
      nombre_completo = coalesce(excluded.nombre_completo, public.perfiles_paciente.nombre_completo),
      fecha_nacimiento = coalesce(excluded.fecha_nacimiento, public.perfiles_paciente.fecha_nacimiento),
      genero = coalesce(excluded.genero, public.perfiles_paciente.genero),
      grupo_sanguineo = coalesce(excluded.grupo_sanguineo, public.perfiles_paciente.grupo_sanguineo);

  elsif p_rol = 'medico' then
    -- `matricula` es UNIQUE: nunca se persiste un provisorio compartido
    -- ("S/M"). Sin matrícula real se genera una provisoria única por usuario
    -- que luego se reemplaza en la vinculación o el completado de perfil.
    insert into public.perfiles_medico (usuario_id, matricula, especialidad, telefono_contacto)
    values (
      p_usuario_id,
      coalesce(
        nullif(
          case lower(coalesce(p_datos->>'matricula', ''))
            when '' then null
            when 's/m' then null
            else p_datos->>'matricula'
          end,
          ''
        ),
        'PENDIENTE-' || upper(left(replace(p_usuario_id::text, '-', ''), 8))
      ),
      p_datos->>'especialidad',
      p_datos->>'telefono_contacto'
    )
    on conflict (usuario_id) do nothing;

  elsif p_rol = 'institucion' then
    insert into public.perfiles_institucion (usuario_id, nombre, cuit, documentacion)
    values (
      p_usuario_id,
      coalesce(p_datos->>'nombre', 'Institución'),
      p_datos->>'cuit',
      coalesce(p_datos->'documentacion', '[]'::jsonb)
    )
    on conflict (usuario_id) do nothing;
  end if;

  return json_build_object('success', true, 'rol', p_rol);
end;
$$;

grant execute on function public.crear_perfil_inicial(uuid, rol_usuario_t, jsonb) to service_role, authenticated;

create or replace function public.activar_alerta_emergencia(
  p_slug text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_exacta boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_incidente_id uuid;
  v_contactos jsonb;
  v_contacto record;
  v_contador int := 0;
begin
  select p.id, p.contactos_emergencia
  into v_paciente_id, v_contactos
  from public.perfiles_paciente p
  join public.tokens_qr t on t.paciente_id = p.id
  where t.slug = p_slug and t.activo = true and p.qr_activo = true
  limit 1;

  if v_paciente_id is null then
    raise exception 'QR no activo o no encontrado';
  end if;

  insert into public.incidentes (paciente_id, tipo, estado, lat, lng, ubicacion)
  values (
    v_paciente_id,
    'emergencia_qr',
    'enviado',
    p_lat,
    p_lng,
    case when p_exacta and p_lat is not null and p_lng is not null 
      then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
      else null
    end
  )
  returning id into v_incidente_id;

  if jsonb_array_length(v_contactos) > 0 then
    for v_contacto in select * from jsonb_to_recordset(v_contactos) as x(nombre text, relacion text, telefono text)
    loop
      insert into public.notificaciones (incidente_id, contacto, canal, estado)
      values (v_incidente_id, row_to_json(v_contacto)::jsonb, 'sms', 'enviado');
      v_contador := v_contador + 1;
    end loop;
  end if;

  return json_build_object('incidente_id', v_incidente_id, 'notificaciones', v_contador);
end;
$$;

grant execute on function public.activar_alerta_emergencia(text, double precision, double precision, boolean) to service_role, anon;

create or replace function public.get_perfil_emergencia(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'alias',                p.alias,
    'grupo_sanguineo',      p.grupo_sanguineo,
    'genero',               p.genero,
    'alergias',             coalesce((
      select jsonb_agg(t.elem order by t.idx)
      from jsonb_array_elements(p.alergias) with ordinality as t(elem, idx)
      where t.elem->>'severidad' = 'Crítico'
    ), '[]'),
    'patologias',           coalesce((
      select jsonb_agg(t.elem order by t.idx)
      from jsonb_array_elements(p.patologias) with ordinality as t(elem, idx)
      where t.elem->>'severidad' = 'Crítico'
    ), '[]'),
    'contactos_emergencia', p.contactos_emergencia,
    'share_location',       p.share_location
  )
  from public.perfiles_paciente p
  join public.tokens_qr t on t.paciente_id = p.id
  where t.slug = p_slug and t.activo = true and p.qr_activo = true
  limit 1;
$$;

grant execute on function public.get_perfil_emergencia(text) to anon, authenticated;

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
alter table public.roles_usuario           enable row level security;
alter table public.perfiles_paciente       enable row level security;
alter table public.perfiles_medico         enable row level security;
alter table public.perfiles_institucion    enable row level security;
alter table public.pacientes_institucion   enable row level security;
alter table public.tokens_qr               enable row level security;
alter table public.incidentes              enable row level security;
alter table public.escaneos_qr             enable row level security;
alter table public.atenciones              enable row level security;
alter table public.registros_medicos       enable row level security;
alter table public.estudios                enable row level security;
alter table public.notificaciones          enable row level security;
alter table public.logs_auditoria          enable row level security;

drop policy if exists "roles_propio" on public.roles_usuario;
create policy "roles_propio" on public.roles_usuario for select using (auth.uid() = usuario_id);

drop policy if exists "paciente_propio" on public.perfiles_paciente;
create policy "paciente_propio" on public.perfiles_paciente for all using (auth.uid() = usuario_id);

drop policy if exists "medico_propio" on public.perfiles_medico;
create policy "medico_propio" on public.perfiles_medico for all using (auth.uid() = usuario_id);

drop policy if exists "institucion_propio" on public.perfiles_institucion;
create policy "institucion_propio" on public.perfiles_institucion for all using (auth.uid() = usuario_id);

drop policy if exists "estudios_propio" on public.estudios;
create policy "estudios_propio" on public.estudios for all using (
  exists (select 1 from public.perfiles_paciente pp where pp.id = paciente_id and pp.usuario_id = auth.uid())
);

-- tokens_qr (rol dual médico-paciente): cada usuario con perfil de paciente
-- solo ve/administra sus propios tokens de QR de emergencia.
drop policy if exists "token_qr_propio" on public.tokens_qr;
create policy "token_qr_propio" on public.tokens_qr for all using (
  exists (
    select 1
    from public.perfiles_paciente pp
    where pp.usuario_id = auth.uid()
      and pp.id = tokens_qr.paciente_id
  )
);

-- escaneos_qr: el médico registra los QR que escanea (insert) y consulta
-- únicamente su propio historial (select).
drop policy if exists "escaneos_qr_insertar" on public.escaneos_qr;
create policy "escaneos_qr_insertar" on public.escaneos_qr for insert
  with check (auth.uid() = usuario_id);

drop policy if exists "escaneos_qr_propios" on public.escaneos_qr;
create policy "escaneos_qr_propios" on public.escaneos_qr for select
  using (auth.uid() = usuario_id);

-- logs_auditoria: cada usuario consulta sus propios registros de auditoría.
drop policy if exists "auditoria_propia" on public.logs_auditoria;
create policy "auditoria_propia" on public.logs_auditoria for select
  using (auth.uid() = usuario_id);