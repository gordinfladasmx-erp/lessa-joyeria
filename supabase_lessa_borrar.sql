-- Lessa Joyería: borrar pedidos/ventas desde el panel. Pegar en Supabase > SQL Editor > Run.
-- Si el pedido era un apartado vigente, las piezas regresan al inventario antes de borrarlo.

create or replace function admin_borrar_pedido(p_pass text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.tipo = 'apartado' and p.estado in ('por_confirmar','confirmado') then
    perform lessa_restock(p.items);
  end if;
  delete from pedidos where id = p_id;
end $$;

create or replace function admin_borrar_canceladas(p_pass text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  delete from pedidos where estado = 'cancelado';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function admin_borrar_pedido(text,bigint) to anon, authenticated;
grant execute on function admin_borrar_canceladas(text) to anon, authenticated;
notify pgrst, 'reload schema';
