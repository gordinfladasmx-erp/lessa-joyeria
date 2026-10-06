-- Lessa: editar lineas de pedidos al proveedor, agregar piezas de reposicion y sumar al inventario al recibir.
-- Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- (Requiere haber corrido antes supabase_lessa_inventario_pedidos.sql)

create table if not exists proveedor_lineas (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  producto_id bigint references productos(id),
  sku text not null,
  nombre text not null,
  cantidad int not null check (cantidad > 0),
  nota text
);
alter table proveedor_lineas enable row level security;

drop function if exists admin_pedir_proveedor(text);
drop function if exists admin_recibir_proveedor(text,bigint);

create or replace function admin_listar_proveedor_lineas(p_pass text)
returns setof proveedor_lineas language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  return query select * from proveedor_lineas order by sku;
end $$;

-- Pieza de reposicion (para sumar al inventario cuando llegue).
create or replace function admin_agregar_linea_proveedor(p_pass text, p_sku text, p_cantidad int, p_nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare pr productos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if coalesce(p_cantidad,0) <= 0 then raise exception 'Cantidad inválida'; end if;
  select * into pr from productos where sku = trim(p_sku);
  if not found then raise exception 'No existe el código %', p_sku; end if;
  insert into proveedor_lineas(producto_id, sku, nombre, cantidad, nota) values (pr.id, pr.sku, pr.nombre, p_cantidad, p_nota);
end $$;

-- Cambiar cantidad (0 = borrar) de una linea de reposicion.
create or replace function admin_editar_linea_proveedor(p_pass text, p_id bigint, p_cantidad int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if coalesce(p_cantidad,0) <= 0 then delete from proveedor_lineas where id = p_id;
  else update proveedor_lineas set cantidad = p_cantidad where id = p_id; end if;
end $$;

-- Cambiar cantidad (0 = quitar) de un producto dentro de un encargo de cliente que aun no se pide al proveedor.
create or replace function admin_editar_item_pedido(p_pass text, p_id bigint, p_idx int, p_cantidad int)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype; nuevos jsonb := '[]'::jsonb; it jsonb; k int := 0;
        sub numeric := 0; v_desc numeric; v_total numeric;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.tipo <> 'encargo' or p.estado not in ('por_confirmar','confirmado') or p.proveedor_estado in ('pedido','recibido') then
    raise exception 'Este pedido ya no se puede editar (ya se pidió al proveedor o está cerrado)';
  end if;
  for it in select * from jsonb_array_elements(p.items) loop
    if k = p_idx then
      if coalesce(p_cantidad,0) > 0 then nuevos := nuevos || jsonb_set(it, '{cantidad}', to_jsonb(p_cantidad)); end if;
    else nuevos := nuevos || it; end if;
    k := k + 1;
  end loop;
  if jsonb_array_length(nuevos) = 0 then
    update pedidos set items = nuevos, estado = 'cancelado', motivo_cancelacion = 'manual', cancelado_at = now(), updated_at = now() where id = p_id;
    return;
  end if;
  select sum((i->>'precio')::numeric * (i->>'cantidad')::int) into sub from jsonb_array_elements(nuevos) i;
  v_desc := case when p.subtotal = 0 then 0 else round(p.descuento * sub / p.subtotal, 2) end;
  v_total := round(sub - v_desc + coalesce(p.envio,0), 2);
  update pedidos set items = nuevos, subtotal = sub, descuento = v_desc, total = v_total,
      anticipo_requerido = case when modo_pago = 'total' then v_total else round(v_total * 0.30, 2) end,
      updated_at = now()
   where id = p_id;
end $$;

-- Cambiar cantidad (0 = quitar) de un producto de un pedido al proveedor que ya esta en camino.
create or replace function admin_editar_proveedor_item(p_pass text, p_batch_id bigint, p_sku text, p_cantidad int)
returns void language plpgsql security definer set search_path = public as $$
declare b pedidos_proveedor%rowtype; nuevos jsonb := '[]'::jsonb; it jsonb; man int;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into b from pedidos_proveedor where id = p_batch_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if b.estado <> 'pedido' then raise exception 'Este pedido ya fue recibido'; end if;
  for it in select * from jsonb_array_elements(b.items) loop
    if it->>'sku' = p_sku then
      if coalesce(p_cantidad,0) > 0 then
        man := greatest(0, coalesce((it->>'manual')::int,0) - ((it->>'cantidad')::int - p_cantidad));
        if p_cantidad > (it->>'cantidad')::int then man := coalesce((it->>'manual')::int,0) + (p_cantidad - (it->>'cantidad')::int); end if;
        nuevos := nuevos || (it || jsonb_build_object('cantidad', p_cantidad, 'manual', man));
      end if;
    else nuevos := nuevos || it; end if;
  end loop;
  update pedidos_proveedor set items = nuevos where id = p_batch_id;
end $$;

-- Junta encargos con reserva pagada + piezas de reposicion y crea el pedido al proveedor.
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
      select i->>'sku' as sku, i->>'nombre' as nombre, (i->>'cantidad')::int as cli, 0 as man
        from pedidos p, jsonb_array_elements(p.items) i where p.id = any(coalesce(ids, '{}'))
      union all
      select sku, nombre, 0, cantidad from proveedor_lineas) u group by sku) x;
  insert into pedidos_proveedor(items, pedido_ids) values (agg, coalesce(ids, '{}')) returning id into nid;
  update pedidos set proveedor_estado = 'pedido', proveedor_pedido_id = nid, entrega_estimada = current_date + 15,
         updated_at = now() where id = any(coalesce(ids, '{}'));
  delete from proveedor_lineas;
  return nid;
end $$;

-- Al recibir: los encargos quedan "recibido" y las piezas de reposicion se suman al inventario.
create or replace function admin_recibir_proveedor(p_pass text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b pedidos_proveedor%rowtype; it jsonb;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into b from pedidos_proveedor where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if b.estado = 'recibido' then raise exception 'Este pedido ya se marcó como recibido'; end if;
  for it in select * from jsonb_array_elements(b.items) loop
    if coalesce((it->>'manual')::int,0) > 0 then
      update productos set stock = stock + (it->>'manual')::int, updated_at = now() where sku = it->>'sku';
    end if;
  end loop;
  update pedidos_proveedor set estado = 'recibido', recibido_at = now() where id = p_id;
  update pedidos set proveedor_estado = 'recibido', updated_at = now()
   where proveedor_pedido_id = p_id and estado <> 'cancelado';
end $$;

grant execute on function admin_listar_proveedor_lineas(text) to anon, authenticated;
grant execute on function admin_agregar_linea_proveedor(text,text,int,text) to anon, authenticated;
grant execute on function admin_editar_linea_proveedor(text,bigint,int) to anon, authenticated;
grant execute on function admin_editar_item_pedido(text,bigint,int,int) to anon, authenticated;
grant execute on function admin_editar_proveedor_item(text,bigint,text,int) to anon, authenticated;
grant execute on function admin_pedir_proveedor(text) to anon, authenticated;
grant execute on function admin_recibir_proveedor(text,bigint) to anon, authenticated;

notify pgrst, 'reload schema';
