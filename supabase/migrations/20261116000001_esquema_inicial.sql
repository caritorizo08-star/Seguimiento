-- =====================================================================
-- Seguimiento · Razones de mora y monitoreo de llamadas
-- Esquema inicial (Postgres / Supabase)
-- Roles de la app: 'admin' (todo) y 'supervisor' (solo sus agentes y créditos).
-- Los agentes NO entran a la app.
-- Datos de clientes: solo nombre y número de crédito. NIT y cédula NO se guardan.
-- =====================================================================

-- ---------- Utilidades ----------
create or replace function public.fn_set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------- Catálogos ----------
create table public.supervisores (
  id_supervisor   bigint generated always as identity,
  nombre          text not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_supervisores primary key (id_supervisor),
  constraint uq_supervisores_nombre unique (nombre)
);

create table public.agentes (
  id_agente       bigint generated always as identity,
  usuario         text not null,               -- usuario del sistema de cobro (p. ej. 'albarbozam')
  nombre          text,
  id_supervisor   bigint,                      -- supervisor actual (el de su última gestión cargada)
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_agentes primary key (id_agente),
  constraint uq_agentes_usuario unique (usuario),
  constraint fk_agentes_supervisor foreign key (id_supervisor) references public.supervisores (id_supervisor)
);

create table public.acciones_mora (
  id_accion       text not null,               -- 'arreglo', 'salario', ...
  nombre_corto    text not null,
  titulo          text not null,
  descripcion     text not null,
  color           text not null,
  orden           smallint not null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_acciones_mora primary key (id_accion),
  constraint ck_acciones_mora_color check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.razones_mora (
  id_razon        bigint generated always as identity,
  nombre          text not null,               -- forma canónica, con tildes
  id_accion       text,                        -- acción sugerida; null = "Otras razones"
  orden           smallint not null default 100,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_razones_mora primary key (id_razon),
  constraint uq_razones_mora_nombre unique (nombre),
  constraint fk_razones_mora_accion foreign key (id_accion) references public.acciones_mora (id_accion)
);

-- ---------- Usuarios de la app ----------
create table public.perfiles (
  user_id         uuid not null,
  nombre          text not null,
  rol             text not null,
  id_supervisor   bigint,                      -- obligatorio si rol = 'supervisor'
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_perfiles primary key (user_id),
  constraint fk_perfiles_user foreign key (user_id) references auth.users (id) on delete cascade,
  constraint fk_perfiles_supervisor foreign key (id_supervisor) references public.supervisores (id_supervisor),
  constraint ck_perfiles_rol check (rol in ('admin', 'supervisor')),
  constraint ck_perfiles_supervisor check (rol = 'admin' or id_supervisor is not null)
);

-- ---------- Periodos (un mes cargado) ----------
create table public.periodos (
  id_periodo        bigint generated always as identity,
  anio              smallint not null,
  mes               smallint not null,
  estado            text not null default 'cargando',
  archivo_gestiones text,
  archivo_cierre    text,
  filas_gestiones   integer not null default 0,
  filas_cierre      integer not null default 0,
  cargado_por       uuid,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint pk_periodos primary key (id_periodo),
  constraint uq_periodos_anio_mes unique (anio, mes),
  constraint ck_periodos_mes check (mes between 1 and 12),
  constraint ck_periodos_anio check (anio between 2020 and 2100),
  constraint ck_periodos_estado check (estado in ('cargando', 'listo')),
  constraint fk_periodos_cargado_por foreign key (cargado_por) references auth.users (id)
);

-- ---------- Gestiones del call center (Rep_GestionesDiarias) ----------
create table public.gestiones (
  id_gestion        bigint generated always as identity,
  id_periodo        bigint not null,
  credito           text not null,
  cliente           text,
  saldo             numeric(14,2),
  codigo_accion     text,
  codigo_resultado  text,
  comentario        text,
  id_agente         bigint,
  fecha_actividad   timestamp,                 -- hora local de Nicaragua, tal como viene en el Excel
  fecha_promesa     date,
  monto_promesa     numeric(14,2),
  razon_original    text,                      -- texto tal cual del Excel
  id_razon          bigint,                    -- null = "No especifica"
  id_supervisor     bigint not null,
  unidad            text,
  tipo_credito      text,
  cartera           text not null,
  es_contacto       boolean not null default false,
  alerta_mask       integer not null default 0,
  alerta_prioridad  smallint not null default 0,
  alerta_notas      text,
  creado_en         timestamptz not null default now(),
  constraint pk_gestiones primary key (id_gestion),
  constraint fk_gestiones_periodo foreign key (id_periodo) references public.periodos (id_periodo) on delete cascade,
  constraint fk_gestiones_agente foreign key (id_agente) references public.agentes (id_agente),
  constraint fk_gestiones_razon foreign key (id_razon) references public.razones_mora (id_razon),
  constraint fk_gestiones_supervisor foreign key (id_supervisor) references public.supervisores (id_supervisor),
  constraint ck_gestiones_cartera check (cartera in ('Legal', 'Administrativa')),
  constraint ck_gestiones_prioridad check (alerta_prioridad between 0 and 3)
);
create index ix_gestiones_periodo_supervisor on public.gestiones (id_periodo, id_supervisor);
create index ix_gestiones_periodo_credito on public.gestiones (id_periodo, credito);
create index ix_gestiones_periodo_agente on public.gestiones (id_periodo, id_agente);
create index ix_gestiones_alertas on public.gestiones (id_periodo, alerta_prioridad desc, fecha_actividad desc) where alerta_mask > 0;

-- ---------- Cierre de cartera ----------
create table public.cierres (
  id_cierre            bigint generated always as identity,
  id_periodo           bigint not null,
  credito              text not null,
  cliente              text,
  id_supervisor        bigint,                 -- null = "Sin Supervisor"
  supervisor_original  text,
  unidad               text,
  usuario_asignado     text,
  tipo_credito         text,
  producto             text,
  tipo_cartera         text,                   -- JUR, NIIF, CJT, ...
  dias_mora_inicio     integer,
  tramo_inicio         smallint,               -- 0 = al día, 1 = 1-30, ... 6 = 151+
  tramo_cierre         smallint,
  saldo_inicio         numeric(14,2),
  saldo                numeric(14,2),
  valor_vencido        numeric(14,2),
  valor_cuota          numeric(14,2),
  recaudo_meta         numeric(14,2),
  recaudo_mes          numeric(14,2),
  pago_vs_cuota        text,                   -- 'Sin pago', '< CUO', '>=CUO'
  rodamiento           text,                   -- MEJORA, MANTIENE, DESMEJORA, CANCELADO
  estatus_ult_promesa  text,                   -- Cumplida, Incumplida, Pendiente, Sin Promesa
  fecha_ultima_promesa date,
  promesas             integer,
  gestiones            integer,
  contactos            integer,
  rpc                  integer,                -- contactos con el titular
  dias_sin_gestion     integer,
  estatus              text,                   -- En Mora, Al dia, Por vencer, Cancelado
  creado_en            timestamptz not null default now(),
  constraint pk_cierres primary key (id_cierre),
  constraint uq_cierres_periodo_credito unique (id_periodo, credito),
  constraint fk_cierres_periodo foreign key (id_periodo) references public.periodos (id_periodo) on delete cascade,
  constraint fk_cierres_supervisor foreign key (id_supervisor) references public.supervisores (id_supervisor),
  constraint ck_cierres_tramo_inicio check (tramo_inicio between 0 and 6),
  constraint ck_cierres_tramo_cierre check (tramo_cierre between 0 and 7)
);
create index ix_cierres_periodo_supervisor on public.cierres (id_periodo, id_supervisor);

-- ---------- Reglas de alertas (editables por el administrador) ----------
create table public.alerta_reglas (
  id_regla          bigint generated always as identity,
  bit               integer not null,          -- potencia de 2; se guarda en gestiones.alerta_mask
  nombre            text not null,
  prioridad         smallint not null,         -- 1 baja, 2 media, 3 alta
  tipo              text not null,
  patron            text,                      -- expresión regular (sintaxis JavaScript) sobre el comentario en MAYÚSCULAS sin tildes
  razones_disparan  text[] not null default '{}', -- razones registradas que también disparan la alerta
  umbral            integer,                   -- para 'llamadas_dia' y 'promesas_mes'
  activa            boolean not null default true,
  orden             smallint not null default 100,
  actualizado_por   uuid,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint pk_alerta_reglas primary key (id_regla),
  constraint uq_alerta_reglas_bit unique (bit),
  constraint ck_alerta_reglas_bit check (bit > 0 and (bit & (bit - 1)) = 0),
  constraint ck_alerta_reglas_prioridad check (prioridad between 1 and 3),
  constraint ck_alerta_reglas_tipo check (tipo in ('palabras', 'razon_distinta', 'razon_no_registrada', 'contacto_sin_razon', 'llamadas_dia', 'promesas_mes')),
  constraint ck_alerta_reglas_umbral check (tipo not in ('llamadas_dia', 'promesas_mes') or umbral > 0),
  constraint fk_alerta_reglas_actualizado_por foreign key (actualizado_por) references auth.users (id)
);

-- Razón que sugiere el comentario y razones registradas compatibles (para "razón distinta al comentario")
create table public.alerta_categorias (
  id_categoria          bigint generated always as identity,
  nombre                text not null,
  patron                text not null,
  razones_compatibles   text[] not null,
  activa                boolean not null default true,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  constraint pk_alerta_categorias primary key (id_categoria),
  constraint uq_alerta_categorias_nombre unique (nombre)
);

-- Patrones auxiliares: "no contestó", "anota razón (RDM)", "promesa"
create table public.alerta_patrones (
  clave           text not null,               -- 'no_contesta', 'rdm', 'promesa'
  descripcion     text not null,
  patron          text not null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_alerta_patrones primary key (clave)
);

-- ---------- Monitoreo de llamadas ----------
create table public.criterios_evaluacion (
  id_criterio     bigint generated always as identity,
  tramo           text not null,               -- 'grave', 'mejora', 'minimo', 'sobresaliente', 'extraordinario'
  descripcion     text not null,
  orden           smallint not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint pk_criterios_evaluacion primary key (id_criterio),
  constraint ck_criterios_evaluacion_tramo check (tramo in ('grave', 'mejora', 'minimo', 'sobresaliente', 'extraordinario'))
);

create table public.monitoreos (
  id_monitoreo        bigint generated always as identity,
  id_gestion          bigint,                  -- la gestión (llamada) escuchada
  id_periodo          bigint not null,
  credito             text not null,
  id_agente           bigint not null,
  id_supervisor       bigint not null,
  estado              text not null default 'escuchada',
  puntaje             numeric(2,1),
  criterios_fallados  bigint[] not null default '{}',  -- ids de criterios_evaluacion no cumplidos
  criterios_cumplidos bigint[] not null default '{}',
  fortalezas          text,
  oportunidades       text,
  compromiso          text,
  retro_dada_en       date,                    -- cuándo se dio la retroalimentación al agente
  creado_por          uuid not null default auth.uid(),  -- el trigger lo fuerza al usuario real
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint pk_monitoreos primary key (id_monitoreo),
  constraint uq_monitoreos_gestion unique (id_gestion),
  constraint fk_monitoreos_gestion foreign key (id_gestion) references public.gestiones (id_gestion) on delete set null,
  constraint fk_monitoreos_periodo foreign key (id_periodo) references public.periodos (id_periodo),  -- sin cascade: recargar un mes no borra evaluaciones
  constraint fk_monitoreos_agente foreign key (id_agente) references public.agentes (id_agente),
  constraint fk_monitoreos_supervisor foreign key (id_supervisor) references public.supervisores (id_supervisor),
  constraint fk_monitoreos_creado_por foreign key (creado_por) references auth.users (id),
  constraint ck_monitoreos_estado check (estado in ('escuchada', 'evaluada')),
  constraint ck_monitoreos_puntaje check (puntaje is null or puntaje between 1 and 5),
  constraint ck_monitoreos_evaluada check (estado <> 'evaluada' or puntaje is not null)
);
create index ix_monitoreos_agente on public.monitoreos (id_agente, creado_en desc);
create index ix_monitoreos_supervisor on public.monitoreos (id_supervisor, creado_en desc);

-- ---------- Triggers de actualizado_en ----------
create trigger tg_supervisores_upd before update on public.supervisores for each row execute function public.fn_set_actualizado_en();
create trigger tg_agentes_upd before update on public.agentes for each row execute function public.fn_set_actualizado_en();
create trigger tg_acciones_mora_upd before update on public.acciones_mora for each row execute function public.fn_set_actualizado_en();
create trigger tg_razones_mora_upd before update on public.razones_mora for each row execute function public.fn_set_actualizado_en();
create trigger tg_perfiles_upd before update on public.perfiles for each row execute function public.fn_set_actualizado_en();
create trigger tg_periodos_upd before update on public.periodos for each row execute function public.fn_set_actualizado_en();
create trigger tg_alerta_reglas_upd before update on public.alerta_reglas for each row execute function public.fn_set_actualizado_en();
create trigger tg_alerta_categorias_upd before update on public.alerta_categorias for each row execute function public.fn_set_actualizado_en();
create trigger tg_alerta_patrones_upd before update on public.alerta_patrones for each row execute function public.fn_set_actualizado_en();
create trigger tg_criterios_evaluacion_upd before update on public.criterios_evaluacion for each row execute function public.fn_set_actualizado_en();
create trigger tg_monitoreos_upd before update on public.monitoreos for each row execute function public.fn_set_actualizado_en();

-- ---------- Funciones de rol (reutilizadas en todas las políticas) ----------
create or replace function public.fn_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' and activo from public.perfiles where user_id = auth.uid()), false)
$$;

create or replace function public.fn_mi_supervisor()
returns bigint language sql stable security definer set search_path = public as $$
  select id_supervisor from public.perfiles where user_id = auth.uid() and activo and rol = 'supervisor'
$$;

create or replace function public.fn_usuario_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select activo from public.perfiles where user_id = auth.uid()), false)
$$;

-- Monitoreos: creado_por siempre es el usuario real; el supervisor solo puede registrar sobre su propio equipo
create or replace function public.fn_monitoreos_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.creado_por := auth.uid();
  if not public.fn_es_admin() then
    new.id_supervisor := public.fn_mi_supervisor();
  end if;
  return new;
end $$;
create trigger tg_monitoreos_bi before insert on public.monitoreos for each row execute function public.fn_monitoreos_bi();

create or replace function public.fn_monitoreos_bu()
returns trigger language plpgsql as $$
begin
  new.creado_por := old.creado_por;
  new.creado_en := old.creado_en;
  if not public.fn_es_admin() then
    new.id_supervisor := old.id_supervisor;
  end if;
  return new;
end $$;
create trigger tg_monitoreos_bu before update on public.monitoreos for each row execute function public.fn_monitoreos_bu();

-- Periodos y reglas: registrar quién cargó / editó
create or replace function public.fn_periodos_bi()
returns trigger language plpgsql as $$
begin
  new.cargado_por := auth.uid();
  return new;
end $$;
create trigger tg_periodos_bi before insert on public.periodos for each row execute function public.fn_periodos_bi();

create or replace function public.fn_alerta_reglas_bu()
returns trigger language plpgsql as $$
begin
  new.actualizado_por := auth.uid();
  return new;
end $$;
create trigger tg_alerta_reglas_bu before insert or update on public.alerta_reglas for each row execute function public.fn_alerta_reglas_bu();

-- ---------- Row Level Security ----------
alter table public.supervisores         enable row level security;
alter table public.agentes              enable row level security;
alter table public.acciones_mora        enable row level security;
alter table public.razones_mora         enable row level security;
alter table public.perfiles             enable row level security;
alter table public.periodos             enable row level security;
alter table public.gestiones            enable row level security;
alter table public.cierres              enable row level security;
alter table public.alerta_reglas        enable row level security;
alter table public.alerta_categorias    enable row level security;
alter table public.alerta_patrones      enable row level security;
alter table public.criterios_evaluacion enable row level security;
alter table public.monitoreos           enable row level security;

-- Catálogos: lectura para usuarios activos; escritura solo admin
create policy pl_supervisores_sel on public.supervisores for select to authenticated using (public.fn_usuario_activo());
create policy pl_supervisores_adm on public.supervisores for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_agentes_sel on public.agentes for select to authenticated
  using (public.fn_es_admin() or id_supervisor = public.fn_mi_supervisor());
create policy pl_agentes_adm on public.agentes for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_acciones_mora_sel on public.acciones_mora for select to authenticated using (public.fn_usuario_activo());
create policy pl_acciones_mora_adm on public.acciones_mora for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_razones_mora_sel on public.razones_mora for select to authenticated using (public.fn_usuario_activo());
create policy pl_razones_mora_adm on public.razones_mora for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_periodos_sel on public.periodos for select to authenticated using (public.fn_usuario_activo());
create policy pl_periodos_adm on public.periodos for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_alerta_reglas_sel on public.alerta_reglas for select to authenticated using (public.fn_usuario_activo());
create policy pl_alerta_reglas_adm on public.alerta_reglas for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_alerta_categorias_sel on public.alerta_categorias for select to authenticated using (public.fn_usuario_activo());
create policy pl_alerta_categorias_adm on public.alerta_categorias for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_alerta_patrones_sel on public.alerta_patrones for select to authenticated using (public.fn_usuario_activo());
create policy pl_alerta_patrones_adm on public.alerta_patrones for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_criterios_sel on public.criterios_evaluacion for select to authenticated using (public.fn_usuario_activo());
create policy pl_criterios_adm on public.criterios_evaluacion for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

-- Perfiles: cada quien ve el suyo; solo admin crea/edita (no hay autoasignación de rol)
create policy pl_perfiles_sel on public.perfiles for select to authenticated using (user_id = auth.uid() or public.fn_es_admin());
create policy pl_perfiles_adm on public.perfiles for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

-- Datos de cartera: admin todo; supervisor solo lo suyo; carga solo admin
create policy pl_gestiones_sel on public.gestiones for select to authenticated
  using (public.fn_es_admin() or id_supervisor = public.fn_mi_supervisor());
create policy pl_gestiones_adm on public.gestiones for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

create policy pl_cierres_sel on public.cierres for select to authenticated
  using (public.fn_es_admin() or id_supervisor = public.fn_mi_supervisor());
create policy pl_cierres_adm on public.cierres for all to authenticated using (public.fn_es_admin()) with check (public.fn_es_admin());

-- Monitoreos: admin todo; supervisor ve y registra sobre su equipo, edita solo lo que él creó
create policy pl_monitoreos_sel on public.monitoreos for select to authenticated
  using (public.fn_es_admin() or id_supervisor = public.fn_mi_supervisor());
create policy pl_monitoreos_ins on public.monitoreos for insert to authenticated
  with check (
    public.fn_es_admin()
    or (public.fn_mi_supervisor() is not null
        and exists (select 1 from public.agentes a where a.id_agente = monitoreos.id_agente and a.id_supervisor = public.fn_mi_supervisor()))
  );
create policy pl_monitoreos_upd on public.monitoreos for update to authenticated
  using (public.fn_es_admin() or (id_supervisor = public.fn_mi_supervisor() and creado_por = auth.uid()))
  with check (public.fn_es_admin() or (id_supervisor = public.fn_mi_supervisor() and creado_por = auth.uid()));
create policy pl_monitoreos_del on public.monitoreos for delete to authenticated using (public.fn_es_admin());

-- Nadie anónimo ve nada: no hay políticas para el rol anon.
