-- Lessa Joyería: inventario real, preórdenes, pedidos a proveedor y panel seguro
-- Pegar completo en Supabase > SQL Editor > Run. Se puede correr varias veces.

alter table pedidos
  add column if not exists subtotal numeric(10,2) default 0,
  add column if not exists descuento numeric(10,2) default 0,
  add column if not exists anticipo_requerido numeric(10,2) default 0,
  add column if not exists pagado numeric(10,2) default 0,
  add column if not exists tiene_preorden boolean default false,
  add column if not exists proveedor_estado text default 'na',
  add column if not exists entrega_estimada date;

-- Los pedidos ya no se leen ni escriben directo desde el navegador.
drop policy if exists "Ver propio pedido" on pedidos;
drop policy if exists "Crear pedido" on pedidos;

create or replace function lessa_admin_ok(p_pass text) returns boolean
language sql immutable as $$ select p_pass = 'lessa2024' $$;

-- Crear pedido: valida inventario en el servidor y descuenta stock.
create or replace function crear_pedido(
  p_nombre text, p_email text, p_whatsapp text, p_notas text,
  p_items jsonb, p_desc_tipo text default 'monto', p_desc_valor numeric default 0,
  p_admin_pass text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod productos%rowtype; qty int; pre boolean;
  v_items jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_sub_pre numeric := 0; v_desc numeric := 0; v_total numeric;
  v_anticipo numeric := 0; v_tiene_pre boolean := false; v_id bigint; v_num text;
  v_entrega date := null;
begin
  if coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_email),'') = '' then
    raise exception 'Nombre y email son obligatorios';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Carrito vacío'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, (it->>'cantidad')::int);
    pre := coalesce((it->>'preorden')::boolean, false);
    select * into prod from productos where id = (it->>'id')::bigint and activo for update;
    if not found then raise exception 'Producto no disponible: %', it->>'sku'; end if;

    if pre then
      if prod.stock > 0 then
        raise exception 'El producto % ya tiene inventario, vuelve a agregarlo al carrito', prod.sku;
      end if;
      v_tiene_pre := true;
      v_sub_pre := v_sub_pre + prod.precio * qty;
    else
      if prod.stock < qty then
        raise exception 'Sin inventario suficiente de % (disponibles: %)', prod.sku, prod.stock;
      end if;
      update productos set stock = stock - qty, updated_at = now() where id = prod.id;
    end if;
    v_sub := v_sub + prod.precio * qty;
    v_items := v_items || jsonb_build_object(
      'id', prod.id, 'sku', prod.sku, 'nombre', prod.nombre,
      'precio', prod.precio, 'cantidad', qty, 'preorden', pre);
  end loop;

  if lessa_admin_ok(p_admin_pass) and coalesce(p_desc_valor,0) > 0 then
    v_desc := case when p_desc_tipo = 'porcentaje'
                   then v_sub * least(p_desc_valor,100) / 100 else least(p_desc_valor, v_sub) end;
  end if;
  v_total := v_sub - v_desc;
  if v_tiene_pre then
    v_anticipo := round((v_sub_pre * (case when v_sub = 0 then 1 else v_total / v_sub end)) * 0.5, 2);
    v_entrega := current_date + 15;
  end if;

  insert into pedidos(numero_pedido, nombre_cliente, email_cliente, whatsapp, items, subtotal,
      descuento, total, estado, notas, anticipo_requerido, pagado, tiene_preorden,
      proveedor_estado, entrega_estimada)
  values ('TMP'||clock_timestamp()::text, p_nombre, p_email, p_whatsapp, v_items, v_sub,
      v_desc, v_total, 'pendiente', p_notas, v_anticipo, 0, v_tiene_pre,
      case when v_tiene_pre then 'por_pedir' else 'na' end, v_entrega)
  returning id into v_id;
  v_num := 'LESSA-' || lpad(v_id::text, 5, '0');
  update pedidos set numero_pedido = v_num where id = v_id;

  return json_build_object('id', v_id, 'numero_pedido', v_num, 'items', v_items,
     'subtotal', v_sub, 'descuento', v_desc, 'total', v_total, 'anticipo', v_anticipo,
     'tiene_preorden', v_tiene_pre, 'entrega_estimada', v_entrega);
end $$;

create or replace function admin_check(p_pass text) returns boolean
language sql security definer set search_path = public as $$ select lessa_admin_ok(p_pass) $$;

create or replace function admin_adjust_stock(p_pass text, p_id bigint, p_delta int, p_set int default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  update productos set stock = greatest(0, coalesce(p_set, stock + p_delta)), updated_at = now()
   where id = p_id returning stock into n;
  return n;
end $$;

create or replace function admin_agregar_producto(p_pass text, p_nombre text, p_sku text,
  p_precio numeric, p_categoria_id bigint, p_stock int)
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  insert into productos(nombre, sku, precio, categoria_id, stock, activo)
  values (p_nombre, p_sku, p_precio, p_categoria_id, greatest(0,p_stock), true) returning id into n;
  return n;
end $$;

create or replace function admin_listar_pedidos(p_pass text)
returns setof pedidos language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  return query select * from pedidos order by created_at desc limit 500;
end $$;

create or replace function admin_actualizar_pedido(p_pass text, p_id bigint,
  p_estado text default null, p_pagado numeric default null, p_proveedor_estado text default null)
returns void language plpgsql security definer set search_path = public as $$
declare ped pedidos%rowtype; it jsonb;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into ped from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p_estado = 'cancelado' and ped.estado <> 'cancelado' then
    for it in select * from jsonb_array_elements(ped.items) loop
      if not coalesce((it->>'preorden')::boolean,false) then
        update productos set stock = stock + (it->>'cantidad')::int where id = (it->>'id')::bigint;
      end if;
    end loop;
  end if;
  update pedidos set
    estado = coalesce(p_estado, estado),
    pagado = coalesce(p_pagado, pagado),
    proveedor_estado = coalesce(p_proveedor_estado, proveedor_estado),
    updated_at = now()
  where id = p_id;
end $$;

-- Marcar en bloque todos los pedidos "por_pedir" como pedidos al proveedor
create or replace function admin_marcar_pedido_proveedor(p_pass text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  update pedidos set proveedor_estado = 'pedido', entrega_estimada = current_date + 15, updated_at = now()
   where proveedor_estado = 'por_pedir' and estado <> 'cancelado';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function crear_pedido(text,text,text,text,jsonb,text,numeric,text) to anon, authenticated;
grant execute on function admin_check(text) to anon, authenticated;
grant execute on function admin_adjust_stock(text,bigint,int,int) to anon, authenticated;
grant execute on function admin_agregar_producto(text,text,text,numeric,bigint,int) to anon, authenticated;
grant execute on function admin_listar_pedidos(text) to anon, authenticated;
grant execute on function admin_actualizar_pedido(text,bigint,text,numeric,text) to anon, authenticated;
grant execute on function admin_marcar_pedido_proveedor(text) to anon, authenticated;

notify pgrst, 'reload schema';
