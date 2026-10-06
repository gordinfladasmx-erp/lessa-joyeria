-- Lessa Joyería: inventario, apartados (15 dias, 30%), encargos, pedidos a proveedor e historial.
-- Pegar COMPLETO en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- Reglas (editables abajo): anticipo 30%, apartado 15 dias, sin pago de reserva se libera a los 2 dias.

drop function if exists crear_pedido(text,text,text,text,jsonb,text,numeric,text);
drop function if exists crear_pedido(text,text,text,text,jsonb,text,text,numeric,text,boolean);
drop function if exists admin_actualizar_pedido(text,bigint,text,numeric,text);
drop function if exists admin_marcar_pedido_proveedor(text);

alter table pedidos
  add column if not exists tipo text default 'apartado',            -- apartado | encargo
  add column if not exists subtotal numeric(10,2) default 0,
  add column if not exists descuento numeric(10,2) default 0,
  add column if not exists anticipo_requerido numeric(10,2) default 0,
  add column if not exists pagado numeric(10,2) default 0,
  add column if not exists pagos jsonb default '[]'::jsonb,
  add column if not exists motivo_cancelacion text,                  -- vencido | sin_pago | manual
  add column if not exists limite_apartado timestamptz,
  add column if not exists confirmado_at timestamptz,
  add column if not exists entregado_at timestamptz,
  add column if not exists cancelado_at timestamptz,
  add column if not exists proveedor_estado text default 'na',       -- na | por_pedir | pedido | recibido
  add column if not exists proveedor_pedido_id bigint,
  add column if not exists entrega_estimada date,
  add column if not exists envio numeric(10,2) default 0,
  add column if not exists descuento_solicitado text,
  add column if not exists entrega_tipo text default 'recoger',       -- recoger | envio
  add column if not exists direccion text,
  add column if not exists modo_pago text default 'apartado',         -- apartado (30%) | total
  add column if not exists validado_at timestamptz,
  add column if not exists fecha_entrega date;

create table if not exists pedidos_proveedor (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  estado text default 'pedido',                                      -- pedido | recibido
  recibido_at timestamptz,
  items jsonb not null,
  pedido_ids bigint[] not null
);
alter table pedidos_proveedor enable row level security;

-- Pedido de prueba anterior al sistema de inventario
update pedidos set estado = 'cancelado', motivo_cancelacion = 'manual', cancelado_at = now()
 where estado = 'pendiente';

-- Nadie lee ni escribe pedidos directo desde el navegador; todo pasa por funciones.
drop policy if exists "Ver propio pedido" on pedidos;
drop policy if exists "Crear pedido" on pedidos;

create or replace function lessa_admin_ok(p_pass text) returns boolean
language sql immutable as $$ select p_pass = 'lessa2024' $$;

create or replace function lessa_restock(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    update productos set stock = stock + (it->>'cantidad')::int, updated_at = now()
     where id = (it->>'id')::bigint;
  end loop;
end $$;

-- Libera apartados vencidos (15 dias) y reservas sin pago (2 dias). Se llama sola desde el sitio.
create or replace function vencer_apartados() returns int
language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype; n int := 0;
begin
  for p in select * from pedidos
            where tipo = 'apartado' and (
              (estado = 'confirmado' and limite_apartado < now()) or
              (estado = 'por_confirmar' and created_at < now() - interval '2 days'))
            for update loop
    perform lessa_restock(p.items);
    update pedidos set estado = 'cancelado', cancelado_at = now(), updated_at = now(),
           motivo_cancelacion = case when p.estado = 'confirmado' then 'vencido' else 'sin_pago' end
     where id = p.id;
    n := n + 1;
  end loop;
  update pedidos set estado = 'cancelado', cancelado_at = now(), updated_at = now(), motivo_cancelacion = 'sin_pago'
   where tipo = 'encargo' and estado = 'por_confirmar' and created_at < now() - interval '7 days';
  return n;
end $$;

create or replace function crear_pedido(
  p_nombre text, p_email text, p_whatsapp text, p_notas text, p_items jsonb,
  p_modo text default 'apartado',          -- apartado (30%) | total (100%)
  p_desc_tipo text default 'monto', p_desc_valor numeric default 0,
  p_admin_pass text default '', p_venta_mostrador boolean default false,
  p_solicitud text default '', p_entrega text default 'recoger', p_direccion text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod productos%rowtype; qty int; pre boolean;
  v_norm jsonb := '[]'::jsonb; v_pre jsonb := '[]'::jsonb; line jsonb;
  s_norm numeric := 0; s_pre numeric := 0; v_sub numeric; v_desc numeric := 0;
  d_norm numeric; d_pre numeric; t_norm numeric; t_pre numeric;
  res jsonb := '[]'::jsonb; v_id bigint; v_num text; ant numeric; es_admin boolean;
  pct numeric := 0.30;
begin
  if coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_email),'') = '' then
    raise exception 'Nombre y email son obligatorios';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Carrito vacío'; end if;
  perform vencer_apartados();
  es_admin := lessa_admin_ok(p_admin_pass);

  for it in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, (it->>'cantidad')::int);
    pre := coalesce((it->>'preorden')::boolean, false);
    select * into prod from productos where id = (it->>'id')::bigint and activo for update;
    if not found then raise exception 'Producto no disponible: %', it->>'sku'; end if;
    line := jsonb_build_object('id', prod.id, 'sku', prod.sku, 'nombre', prod.nombre,
                               'precio', prod.precio, 'cantidad', qty);
    if pre then
      if prod.stock > 0 then
        raise exception 'El producto % ya tiene inventario; quítalo y agrégalo como disponible', prod.sku;
      end if;
      v_pre := v_pre || line; s_pre := s_pre + prod.precio * qty;
    else
      if prod.stock < qty then
        raise exception 'Sin inventario suficiente de % (disponibles: %)', prod.sku, prod.stock;
      end if;
      update productos set stock = stock - qty, updated_at = now() where id = prod.id;
      v_norm := v_norm || line; s_norm := s_norm + prod.precio * qty;
    end if;
  end loop;

  v_sub := s_norm + s_pre;
  if es_admin and coalesce(p_desc_valor,0) > 0 then
    v_desc := case when p_desc_tipo = 'porcentaje'
                   then v_sub * least(p_desc_valor,100) / 100 else least(p_desc_valor, v_sub) end;
  end if;
  d_norm := case when v_sub = 0 then 0 else round(v_desc * s_norm / v_sub, 2) end;
  d_pre  := v_desc - d_norm;
  t_norm := s_norm - d_norm;  t_pre := s_pre - d_pre;

  if jsonb_array_length(v_norm) > 0 then
    ant := case when p_modo = 'total' or p_venta_mostrador then t_norm else round(t_norm * pct, 2) end;
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento,
        total, estado, notas, anticipo_requerido, pagado, proveedor_estado,
        descuento_solicitado, entrega_tipo, direccion, modo_pago, validado_at)
    values ('TMP'||clock_timestamp()::text, 'apartado', p_nombre, p_email, p_whatsapp, v_norm, s_norm, d_norm,
        t_norm, 'por_confirmar', p_notas, ant, 0, 'na',
        p_solicitud, p_entrega, p_direccion, case when p_modo = 'total' then 'total' else 'apartado' end,
        case when es_admin then now() end) returning id into v_id;
    v_num := 'LESSA-' || lpad(v_id::text, 5, '0');
    update pedidos set numero_pedido = v_num where id = v_id;
    if es_admin and p_venta_mostrador then
      update pedidos set estado = 'entregado', pagado = total, confirmado_at = now(), entregado_at = now(),
             pagos = jsonb_build_array(jsonb_build_object('fecha', now(), 'monto', total, 'nota', 'Venta en mostrador'))
       where id = v_id;
    end if;
    res := res || jsonb_build_object('id', v_id, 'numero_pedido', v_num, 'tipo', 'apartado', 'items', v_norm,
        'subtotal', s_norm, 'descuento', d_norm, 'total', t_norm, 'anticipo', ant, 'mostrador', es_admin and p_venta_mostrador,
        'dias_apartado', 15, 'validado', es_admin);
  end if;

  if jsonb_array_length(v_pre) > 0 then
    ant := case when p_modo = 'total' then t_pre else round(t_pre * pct, 2) end;
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento,
        total, estado, notas, anticipo_requerido, pagado, proveedor_estado, entrega_estimada,
        descuento_solicitado, entrega_tipo, direccion, modo_pago, validado_at)
    values ('TMP'||clock_timestamp()::text, 'encargo', p_nombre, p_email, p_whatsapp, v_pre, s_pre, d_pre,
        t_pre, 'por_confirmar', p_notas, ant, 0, 'na', current_date + 15,
        p_solicitud, p_entrega, p_direccion, case when p_modo = 'total' then 'total' else 'apartado' end,
        case when es_admin then now() end) returning id into v_id;
    v_num := 'LESSA-' || lpad(v_id::text, 5, '0') || '-E';
    update pedidos set numero_pedido = v_num where id = v_id;
    res := res || jsonb_build_object('id', v_id, 'numero_pedido', v_num, 'tipo', 'encargo', 'items', v_pre,
        'subtotal', s_pre, 'descuento', d_pre, 'total', t_pre, 'anticipo', ant, 'mostrador', false,
        'entrega_estimada', current_date + 15, 'validado', es_admin);
  end if;

  return json_build_object('pedidos', res, 'total', t_norm + t_pre);
end $$;

-- El cliente solo solicita; Lessa valida: descuento, envio local, valor neto y fecha de entrega.
create or replace function admin_validar_pedido(p_pass text, p_id bigint, p_desc_tipo text default 'monto',
  p_desc_valor numeric default 0, p_envio numeric default 0, p_fecha_entrega date default null)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype; v_desc numeric; v_envio numeric; v_total numeric;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.estado <> 'por_confirmar' then raise exception 'Solo se puede ajustar antes de confirmar el pago de la reserva'; end if;
  v_desc := case when p_desc_tipo = 'porcentaje'
                 then p.subtotal * least(greatest(coalesce(p_desc_valor,0),0),100) / 100
                 else least(greatest(coalesce(p_desc_valor,0),0), p.subtotal) end;
  v_envio := greatest(coalesce(p_envio,0),0);
  v_total := round(p.subtotal - v_desc + v_envio, 2);
  update pedidos set descuento = round(v_desc,2), envio = v_envio, total = v_total,
      anticipo_requerido = case when modo_pago = 'total' then v_total else round(v_total * 0.30, 2) end,
      fecha_entrega = p_fecha_entrega, validado_at = now(), updated_at = now()
   where id = p_id;
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
  perform vencer_apartados();
  return query select * from pedidos order by created_at desc limit 2000;
end $$;

create or replace function admin_listar_proveedor(p_pass text)
returns setof pedidos_proveedor language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  return query select * from pedidos_proveedor order by created_at desc limit 500;
end $$;

-- Registrar un pago. Al llegar al anticipo se confirma: el apartado corre 15 dias y el encargo pasa a "por pedir".
create or replace function admin_registrar_pago(p_pass text, p_id bigint, p_monto numeric, p_nota text default '')
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'Monto inválido'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.estado in ('cancelado','entregado') then raise exception 'El pedido ya está %', p.estado; end if;
  update pedidos set pagado = pagado + p_monto,
      pagos = pagos || jsonb_build_object('fecha', now(), 'monto', p_monto, 'nota', coalesce(p_nota,'')),
      updated_at = now()
   where id = p_id;
  if p.estado = 'por_confirmar' and p.pagado + p_monto >= p.anticipo_requerido then
    update pedidos set estado = 'confirmado', confirmado_at = now(),
        limite_apartado = case when tipo = 'apartado' then now() + interval '15 days' else null end,
        proveedor_estado = case when tipo = 'encargo' then 'por_pedir' else 'na' end
     where id = p_id;
  end if;
end $$;

create or replace function admin_entregar(p_pass text, p_id bigint, p_cobrar_saldo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.estado <> 'confirmado' then raise exception 'Primero debe confirmarse el pago de la reserva'; end if;
  if p.tipo = 'encargo' and p.proveedor_estado <> 'recibido' then
    raise exception 'El producto aún no llega del proveedor';
  end if;
  if p.pagado < p.total then
    if not p_cobrar_saldo then raise exception 'Falta cobrar %', (p.total - p.pagado); end if;
    update pedidos set pagos = pagos || jsonb_build_object('fecha', now(), 'monto', p.total - p.pagado, 'nota', 'Saldo a la entrega'),
           pagado = total where id = p_id;
  end if;
  update pedidos set estado = 'entregado', entregado_at = now(), updated_at = now() where id = p_id;
end $$;

create or replace function admin_cancelar(p_pass text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if p.estado in ('cancelado','entregado') then raise exception 'El pedido ya está %', p.estado; end if;
  if p.tipo = 'apartado' then perform lessa_restock(p.items); end if;
  update pedidos set estado = 'cancelado', motivo_cancelacion = 'manual', cancelado_at = now(), updated_at = now()
   where id = p_id;
end $$;



revoke execute on function lessa_restock(jsonb) from public, anon, authenticated;

grant execute on function vencer_apartados() to anon, authenticated;
grant execute on function crear_pedido(text,text,text,text,jsonb,text,text,numeric,text,boolean,text,text,text) to anon, authenticated;
grant execute on function admin_validar_pedido(text,bigint,text,numeric,numeric,date) to anon, authenticated;
grant execute on function admin_check(text) to anon, authenticated;
grant execute on function admin_adjust_stock(text,bigint,int,int) to anon, authenticated;
grant execute on function admin_agregar_producto(text,text,text,numeric,bigint,int) to anon, authenticated;
grant execute on function admin_listar_pedidos(text) to anon, authenticated;
grant execute on function admin_listar_proveedor(text) to anon, authenticated;
grant execute on function admin_registrar_pago(text,bigint,numeric,text) to anon, authenticated;
grant execute on function admin_entregar(text,bigint,boolean) to anon, authenticated;
grant execute on function admin_cancelar(text,bigint) to anon, authenticated;

notify pgrst, 'reload schema';
