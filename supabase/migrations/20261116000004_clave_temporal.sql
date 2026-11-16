-- =====================================================================
-- Usuarios creados desde la app con clave temporal.
-- La creación de cuentas la hace la Edge Function "admin-usuarios" (usa la clave de servicio,
-- que nunca llega al navegador). Aquí solo se agrega la marca de "debe cambiar la clave".
-- =====================================================================

alter table public.perfiles
  add column debe_cambiar_clave boolean not null default false;

-- El propio usuario marca que ya cambió su clave (no puede tocar nada más de su perfil).
create or replace function public.fn_clave_cambiada()
returns void
language sql security definer set search_path = public as $$
  update public.perfiles set debe_cambiar_clave = false where user_id = auth.uid();
$$;

revoke all on function public.fn_clave_cambiada() from public, anon;
grant execute on function public.fn_clave_cambiada() to authenticated;
