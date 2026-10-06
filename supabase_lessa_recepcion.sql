-- Lessa: cotejar lo pedido vs lo recibido del proveedor, linea por linea, y mover el inventario.
-- Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- (Requiere supabase_lessa_proveedor_lineas.sql ya ejecutado.)
-- Regla: lo recibido de cada linea se divide asi: primero se separa para los encargos de clientes
-- (igual que un apartado, no queda disponible para otros) y el resto entra al inventario.

drop function if exists admin_recibir_proveedor(text,bigint);

create or replace function admin_confirmar_recepcion(p_pass text, p_batch_id bigint, p_sku text, p_recibido int)
returns json language plpgsql security definer set search_path = public as $$
declare
  b pedidos_proveedor%rowtype; it jsonb; nuevos jsonb := '[]'::jsonb; hallado boolean := false;
  cant int; man int; cust int; alloc int := 0; stock_add int := 0; remaining int;
  ped pedidos%rowtype; pit jsonb; pit2 jsonb; pnew jsonb; need int; give int; todos boolean; cerrado boolean := false;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into b from pedidos_proveedor where id = p_batch_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if b.estado <> 'pedido' then raise exception 'Este pedido al proveedor ya está cerrado'; end if;
  if coalesce(p_recibido, -1) < 0 then raise exception 'Cantidad inválida'; end if;

  for it in select * from jsonb_array_elements(b.items) loop
    if it->>'sku' = p_sku then
      if coalesce((it->>'confirmado')::boolean, false) then raise exception 'La línea % ya estaba confirmada', p_sku; end if;
      hallado := true;
      cant := (it->>'cantidad')::int; man := coalesce((it->>'manual')::int, 0);
      cust := greatest(cant - man, 0);
      alloc := least(p_recibido, cust);
      stock_add := p_recibido - alloc;
      nuevos := nuevos || (it || jsonb_build_object('recibido', p_recibido, 'confirmado', true));
    else
      nuevos := nuevos || it;
    end if;
  end loop;
  if not hallado then raise exception 'La línea % no está en este pedido', p_sku; end if;

  if stock_add > 0 then
    update productos set stock = stock + stock_add, updated_at = now() where sku = p_sku;
  end if;

  remaining := alloc;
  for ped in select * from pedidos where proveedor_pedido_id = p_batch_id and estado <> 'cancelado' order by created_at for update loop
    pnew := '[]'::jsonb;
    for pit in select * from jsonb_array_elements(ped.items) loop
      pit2 := pit;
      if pit->>'sku' = p_sku and remaining > 0 then
        need := (pit->>'cantidad')::int - coalesce((pit->>'recibido')::int, 0);
        give := greatest(least(need, remaining), 0);
        remaining := remaining - give;
        pit2 := pit || jsonb_build_object('recibido', coalesce((pit->>'recibido')::int, 0) + give);
      end if;
      pnew := pnew || pit2;
    end loop;
    todos := not exists (select 1 from jsonb_array_elements(pnew) i
                          where coalesce((i->>'recibido')::int, 0) < (i->>'cantidad')::int);
    update pedidos set items = pnew,
           proveedor_estado = case when todos then 'recibido' else proveedor_estado end,
           updated_at = now()
     where id = ped.id;
  end loop;

  update pedidos_proveedor set items = nuevos where id = p_batch_id;

  if not exists (select 1 from jsonb_array_elements(nuevos) i where not coalesce((i->>'confirmado')::boolean, false)) then
    update pedidos_proveedor set estado = 'recibido', recibido_at = now() where id = p_batch_id;
    update pedidos set proveedor_estado = 'por_pedir', proveedor_pedido_id = null, updated_at = now()
     where proveedor_pedido_id = p_batch_id and estado <> 'cancelado' and proveedor_estado = 'pedido';
    cerrado := true;
  end if;
  return json_build_object('cerrado', cerrado, 'al_inventario', stock_add, 'para_clientes', alloc);
end $$;

-- Cierra el pedido aunque queden lineas sin confirmar: lo no recibido de clientes vuelve a la lista por pedir.
create or replace function admin_cerrar_pedido_proveedor(p_pass text, p_batch_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare b pedidos_proveedor%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into b from pedidos_proveedor where id = p_batch_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if b.estado <> 'pedido' then raise exception 'Este pedido al proveedor ya está cerrado'; end if;
  update pedidos_proveedor set estado = 'recibido', recibido_at = now() where id = p_batch_id;
  update pedidos set proveedor_estado = 'por_pedir', proveedor_pedido_id = null, updated_at = now()
   where proveedor_pedido_id = p_batch_id and estado <> 'cancelado' and proveedor_estado = 'pedido';
end $$;

-- Lo que falta por pedir de cada encargo = pedido - ya recibido.
create or replace function admin_pedir_proveedor(p_pass text) returns bigint
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; agg jsonb; nid bigint;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select array_agg(id) into ids from pedidos
   where tipo = 'encargo' and estado = 'confirmado' and proveedor_estado = 'por_pedir';
  if ids is null and not exists (select 1 from proveedor_lineas) then raise exception 'No hay nada por pedir'; end if;
  select jsonb_agg(jsonb_build_object('sku', sku, 'nombre', nombre, 'cantidad', cli + man, 'manual', man) order by sku) into agg from (
    select sku, max(nombre) as nombre, sum(cli) as cli, sum(man) as man from (
      select i->>'sku' as sku, i->>'nombre' as nombre,
             greatest((i->>'cantidad')::int - coalesce((i->>'recibido')::int, 0), 0) as cli, 0 as man
        from pedidos p, jsonb_array_elements(p.items) i where p.id = any(coalesce(ids, '{}'))
      union all
      select sku, nombre, 0, cantidad from proveedor_lineas) u
     group by sku having sum(cli) + sum(man) > 0) x;
  insert into pedidos_proveedor(items, pedido_ids) values (agg, coalesce(ids, '{}')) returning id into nid;
  update pedidos set proveedor_estado = 'pedido', proveedor_pedido_id = nid, entrega_estimada = current_date + 15,
         updated_at = now() where id = any(coalesce(ids, '{}'));
  delete from proveedor_lineas;
  return nid;
end $$;

-- Cancelar / borrar un encargo ya recibido devuelve al inventario lo que se le habia separado.
create or replace function lessa_restock_recibido(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'recibido')::int, 0) > 0 then
      update productos set stock = stock + (it->>'recibido')::int, updated_at = now() where id = (it->>'id')::bigint;
    end if;
  end loop;
end $$;
revoke execute on function lessa_restock_recibido(jsonb) from public, anon, authenticated;

create or replace function admin_cancelar(p_pass text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.estado in ('cancelado','entregado') then raise exception 'El pedido ya está %', p.estado; end if;
  if p.tipo = 'apartado' then perform lessa_restock(p.items); else perform lessa_restock_recibido(p.items); end if;
  update pedidos set estado = 'cancelado', motivo_cancelacion = 'manual', cancelado_at = now(), updated_at = now()
   where id = p_id;
end $$;

create or replace function admin_borrar_pedido(p_pass text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.estado in ('por_confirmar','confirmado') then
    if p.tipo = 'apartado' then perform lessa_restock(p.items); else perform lessa_restock_recibido(p.items); end if;
  end if;
  delete from pedidos where id = p_id;
end $$;

grant execute on function admin_confirmar_recepcion(text,bigint,text,int) to anon, authenticated;
grant execute on function admin_cerrar_pedido_proveedor(text,bigint) to anon, authenticated;
grant execute on function admin_pedir_proveedor(text) to anon, authenticated;
grant execute on function admin_cancelar(text,bigint) to anon, authenticated;
grant execute on function admin_borrar_pedido(text,bigint) to anon, authenticated;

notify pgrst, 'reload schema';
