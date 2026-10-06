-- Lessa: borrar productos ocultos de forma definitiva desde el modo edicion.
-- Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- Solo se pueden borrar productos que estan OCULTOS (hay que ocultarlos primero).
-- El historial de pedidos y ventas no se afecta: guarda su propia copia del nombre y precio.

create or replace function admin_borrar_producto(p_pass text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from productos where id = p_id and activo = false) then
    raise exception 'Solo se pueden borrar productos ocultos. Oculta el producto primero.';
  end if;
  if to_regclass('public.proveedor_lineas') is not null then delete from proveedor_lineas where producto_id = p_id; end if;
  if to_regclass('public.carrito') is not null then delete from carrito where producto_id = p_id; end if;
  delete from productos where id = p_id;
end $$;

create or replace function admin_borrar_ocultos(p_pass text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if to_regclass('public.proveedor_lineas') is not null then
    delete from proveedor_lineas where producto_id in (select id from productos where activo = false);
  end if;
  if to_regclass('public.carrito') is not null then
    delete from carrito where producto_id in (select id from productos where activo = false);
  end if;
  delete from productos where activo = false;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function admin_borrar_producto(text,bigint) to anon, authenticated;
grant execute on function admin_borrar_ocultos(text) to anon, authenticated;
notify pgrst, 'reload schema';
