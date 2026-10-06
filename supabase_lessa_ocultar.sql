-- Lessa: ocultar / mostrar productos desde el modo edicion. Pegar en Supabase > SQL Editor > Run.
-- Un producto oculto deja de verse en la tienda (catalogo, destacados, busquedas) pero no se borra.

create or replace function admin_set_activo(p_pass text, p_id bigint, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  update productos set activo = p_valor, updated_at = now() where id = p_id;
end $$;

create or replace function admin_listar_ocultos(p_pass text)
returns setof productos language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  return query select * from productos where activo = false order by sku;
end $$;

grant execute on function admin_set_activo(text,bigint,boolean) to anon, authenticated;
grant execute on function admin_listar_ocultos(text) to anon, authenticated;
notify pgrst, 'reload schema';
