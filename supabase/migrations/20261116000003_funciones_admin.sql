-- =====================================================================
-- Funciones para el administrador
-- =====================================================================

-- Actualiza en bloque las alertas de muchas gestiones (al recalcular con reglas nuevas).
-- security invoker: las políticas RLS de gestiones (solo admin escribe) siguen aplicando.
create or replace function public.fn_actualizar_alertas(
  p_ids bigint[], p_masks integer[], p_prioridades smallint[], p_notas text[], p_contactos boolean[]
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  n integer;
begin
  if not public.fn_es_admin() then
    raise exception 'Solo el administrador puede recalcular alertas';
  end if;
  update public.gestiones g
     set alerta_mask = u.mask, alerta_prioridad = u.prio, alerta_notas = u.notas, es_contacto = u.cont
    from unnest(p_ids, p_masks, p_prioridades, p_notas, p_contactos) as u(id, mask, prio, notas, cont)
   where g.id_gestion = u.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Lista las cuentas de acceso (Supabase Auth) para que el admin les asigne rol.
-- security definer porque auth.users no es visible desde el cliente; valida que quien llama sea admin.
create or replace function public.fn_cuentas_acceso()
returns table (user_id uuid, email text, creado_en timestamptz, ultimo_ingreso timestamptz, tiene_perfil boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_es_admin() then
    raise exception 'Solo el administrador puede ver las cuentas';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, exists (select 1 from public.perfiles p where p.user_id = u.id)
      from auth.users u
     order by u.email;
end $$;

revoke all on function public.fn_cuentas_acceso() from public, anon;
grant execute on function public.fn_cuentas_acceso() to authenticated;
revoke all on function public.fn_actualizar_alertas(bigint[], integer[], smallint[], text[], boolean[]) from public, anon;
grant execute on function public.fn_actualizar_alertas(bigint[], integer[], smallint[], text[], boolean[]) to authenticated;
