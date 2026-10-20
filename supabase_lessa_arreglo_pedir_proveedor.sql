-- Lessa / Lumina: corrige "DELETE requires a WHERE clause" al pulsar "Ya hice el pedido al proveedor".
-- Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.

create or replace function admin_pedir_proveedor(p_pass text, p_urgente boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; agg jsonb; nid bigint;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select array_agg(id) into ids from pedidos
   where tipo = 'encargo' and estado = 'confirmado' and proveedor_estado = 'por_pedir'
     and coalesce(urgente,false) = coalesce(p_urgente,false);
  if ids is null and (p_urgente or not exists (select 1 from proveedor_lineas)) then
    raise exception 'No hay nada por pedir en esta lista';
  end if;
  select jsonb_agg(jsonb_build_object('sku', sku, 'nombre', nombre, 'cantidad', cli + man, 'manual', man) order by sku) into agg from (
    select sku, max(nombre) as nombre, sum(cli) as cli, sum(man) as man from (
      select i->>'sku' as sku, i->>'nombre' as nombre,
             greatest((i->>'cantidad')::int - coalesce((i->>'recibido')::int, 0), 0) as cli, 0 as man
        from pedidos p, jsonb_array_elements(p.items) i where p.id = any(coalesce(ids, '{}'))
      union all
      select sku, nombre, 0, cantidad from proveedor_lineas where not coalesce(p_urgente,false)) u
     group by sku having sum(cli) + sum(man) > 0) x;
  insert into pedidos_proveedor(items, pedido_ids, urgente) values (agg, coalesce(ids, '{}'), coalesce(p_urgente,false)) returning id into nid;
  update pedidos set proveedor_estado = 'pedido', proveedor_pedido_id = nid, updated_at = now()
   where id = any(coalesce(ids, '{}'));
  if not coalesce(p_urgente,false) then delete from proveedor_lineas where true; end if;
  return nid;
end $$;

grant execute on function admin_pedir_proveedor(text,boolean) to anon, authenticated;
notify pgrst, 'reload schema';
