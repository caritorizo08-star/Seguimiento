-- Rendimiento de RLS: las funciones de perfil se evaluaban fila por fila y las consultas de un supervisor
-- (≈100k gestiones) superaban el tiempo límite de la API. Envueltas en (select …) se evalúan una vez por consulta
-- y Postgres puede usar el índice (id_periodo, id_supervisor).

drop policy if exists pl_gestiones_sel on public.gestiones;
create policy pl_gestiones_sel on public.gestiones for select to authenticated
  using ((select public.fn_es_admin()) or id_supervisor = (select public.fn_mi_supervisor()));
drop policy if exists pl_gestiones_adm on public.gestiones;
create policy pl_gestiones_adm on public.gestiones for all to authenticated
  using ((select public.fn_es_admin())) with check ((select public.fn_es_admin()));

drop policy if exists pl_agentes_sel on public.agentes;
create policy pl_agentes_sel on public.agentes for select to authenticated
  using ((select public.fn_es_admin()) or id_supervisor = (select public.fn_mi_supervisor()));

drop policy if exists pl_monitoreos_sel on public.monitoreos;
create policy pl_monitoreos_sel on public.monitoreos for select to authenticated
  using ((select public.fn_es_admin()) or id_supervisor = (select public.fn_mi_supervisor()));
drop policy if exists pl_monitoreos_upd on public.monitoreos;
create policy pl_monitoreos_upd on public.monitoreos for update to authenticated
  using ((select public.fn_es_admin()) or (id_supervisor = (select public.fn_mi_supervisor()) and creado_por = (select auth.uid())))
  with check ((select public.fn_es_admin()) or (id_supervisor = (select public.fn_mi_supervisor()) and creado_por = (select auth.uid())));

create index if not exists ix_gestiones_supervisor_periodo on public.gestiones (id_supervisor, id_periodo, id_gestion);
