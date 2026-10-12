-- Lessa / Lumina: ventas en CONSIGNACION. Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- Una consignacion saca las piezas del inventario y las deja con una persona SIN cobrar.
-- No cuenta como venta hasta que se liquida (lo que se vendio se cobra, lo que no se devuelve al inventario).

alter table pedidos add column if not exists consignacion_id bigint;   -- en las ventas que nacen de una liquidacion

drop function if exists admin_registrar_venta(text,date,text,text,jsonb,text,numeric,text,boolean);

create or replace function admin_registrar_venta(
  p_pass text, p_fecha date, p_cliente text, p_telefono text, p_items jsonb,
  p_desc_tipo text default 'monto', p_desc_valor numeric default 0,
  p_notas text default '', p_forzar boolean default false, p_consignacion boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod productos%rowtype; qty int; prc numeric; line jsonb;
  v_items jsonb := '[]'::jsonb; v_sub numeric := 0; v_desc numeric := 0; v_total numeric;
  v_id bigint; v_num text; v_fecha timestamptz;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto'; end if;
  if p_consignacion and coalesce(trim(p_cliente),'') = '' then raise exception 'Indica quién tiene los productos en consignación'; end if;
  v_fecha := (coalesce(p_fecha, current_date)::text || ' 12:00:00')::timestamptz;

  for it in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, (it->>'cantidad')::int);
    select * into prod from productos where id = (it->>'id')::bigint for update;
    if not found then raise exception 'Producto no existe'; end if;
    prc := coalesce(nullif(it->>'precio','')::numeric, prod.precio);
    if prc < 0 then raise exception 'Precio inválido en %', prod.sku; end if;
    if prod.stock < qty and not coalesce(p_forzar,false) then
      raise exception 'Sin inventario suficiente de % (disponibles: %). Ajusta el inventario o marca la opción de registrar de todos modos.', prod.sku, prod.stock;
    end if;
    update productos set stock = greatest(0, stock - qty), updated_at = now() where id = prod.id;
    line := jsonb_build_object('id', prod.id, 'sku', prod.sku, 'nombre', prod.nombre, 'precio', prc, 'cantidad', qty);
    if p_consignacion then line := line || jsonb_build_object('vendido', 0, 'devuelto', 0); end if;
    v_items := v_items || line;
    v_sub := v_sub + prc * qty;
  end loop;

  if p_consignacion then
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento, total,
        estado, notas, anticipo_requerido, pagado, pagos, proveedor_estado, created_at, updated_at, validado_at, modo_pago)
    values ('TMP'||clock_timestamp()::text, 'consignacion', trim(p_cliente), '', coalesce(p_telefono,''), v_items, v_sub, 0, v_sub,
        'consignado', p_notas, 0, 0, '[]'::jsonb, 'na', v_fecha, now(), v_fecha, 'total')
    returning id into v_id;
    v_num := 'C-' || lpad(v_id::text, 5, '0');
    update pedidos set numero_pedido = v_num where id = v_id;
    return json_build_object('id', v_id, 'numero_pedido', v_num, 'subtotal', v_sub, 'descuento', 0, 'total', v_sub, 'consignacion', true);
  end if;

  if coalesce(p_desc_valor,0) > 0 then
    v_desc := case when p_desc_tipo = 'porcentaje' then v_sub * least(p_desc_valor,100) / 100
                   else least(p_desc_valor, v_sub) end;
  end if;
  v_desc := round(v_desc, 2);
  v_total := round(v_sub - v_desc, 2);

  insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento, total,
      estado, notas, anticipo_requerido, pagado, pagos, proveedor_estado, confirmado_at, entregado_at, created_at, updated_at,
      validado_at, modo_pago)
  values ('TMP'||clock_timestamp()::text, 'venta', coalesce(nullif(trim(p_cliente),''), 'Cliente de mostrador'), '',
      coalesce(p_telefono,''), v_items, v_sub, v_desc, v_total, 'entregado', p_notas, 0, v_total,
      jsonb_build_array(jsonb_build_object('fecha', v_fecha, 'monto', v_total, 'nota', 'Venta manual')),
      'na', v_fecha, v_fecha, v_fecha, now(), v_fecha, 'total')
  returning id into v_id;
  v_num := 'V-' || lpad(v_id::text, 5, '0');
  update pedidos set numero_pedido = v_num where id = v_id;
  return json_build_object('id', v_id, 'numero_pedido', v_num, 'subtotal', v_sub, 'descuento', v_desc, 'total', v_total);
end $$;

-- Liquidar (total o parcial): lo vendido se cobra y se vuelve venta; lo devuelto regresa al inventario.
-- p_lineas: [{"id": <producto>, "vendidas": n, "devueltas": n, "precio": <opcional>}]
create or replace function admin_liquidar_consignacion(
  p_pass text, p_id bigint, p_lineas jsonb, p_fecha date default current_date,
  p_descuento numeric default 0, p_notas text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c pedidos%rowtype; it jsonb; l jsonb; pend int; v int; d int; prc numeric;
  nuevos jsonb := '[]'::jsonb; vend jsonb := '[]'::jsonb; sub numeric := 0; tot_v int := 0; tot_d int := 0;
  hay_pend boolean := false; v_fecha timestamptz; v_total numeric; v_desc numeric; v_id bigint; v_num text;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into c from pedidos where id = p_id for update;
  if not found or c.tipo <> 'consignacion' then raise exception 'Consignación no existe'; end if;
  if c.estado <> 'consignado' then raise exception 'Esta consignación ya está liquidada'; end if;
  v_fecha := (coalesce(p_fecha, current_date)::text || ' 12:00:00')::timestamptz;

  for it in select * from jsonb_array_elements(c.items) loop
    select x into l from jsonb_array_elements(p_lineas) x where (x->>'id')::bigint = (it->>'id')::bigint limit 1;
    v := coalesce((l->>'vendidas')::int, 0);
    d := coalesce((l->>'devueltas')::int, 0);
    pend := (it->>'cantidad')::int - coalesce((it->>'vendido')::int, 0) - coalesce((it->>'devuelto')::int, 0);
    if v < 0 or d < 0 or v + d > pend then
      raise exception 'Cantidades inválidas en % (pendientes: %)', it->>'sku', pend;
    end if;
    if d > 0 then
      update productos set stock = stock + d, updated_at = now() where id = (it->>'id')::bigint;
    end if;
    if v > 0 then
      prc := coalesce(nullif(l->>'precio','')::numeric, (it->>'precio')::numeric);
      vend := vend || jsonb_build_object('id', (it->>'id')::bigint, 'sku', it->>'sku', 'nombre', it->>'nombre', 'precio', prc, 'cantidad', v);
      sub := sub + prc * v;
    end if;
    tot_v := tot_v + v; tot_d := tot_d + d;
    if pend - v - d > 0 then hay_pend := true; end if;
    nuevos := nuevos || (it || jsonb_build_object('vendido', coalesce((it->>'vendido')::int,0) + v, 'devuelto', coalesce((it->>'devuelto')::int,0) + d));
  end loop;
  if tot_v + tot_d = 0 then raise exception 'Captura al menos una pieza vendida o devuelta'; end if;

  if tot_v > 0 then
    v_desc := round(least(greatest(coalesce(p_descuento,0),0), sub), 2);
    v_total := round(sub - v_desc, 2);
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento, total,
        estado, notas, anticipo_requerido, pagado, pagos, proveedor_estado, confirmado_at, entregado_at, created_at, updated_at,
        validado_at, modo_pago, consignacion_id)
    values ('TMP'||clock_timestamp()::text, 'venta', c.nombre_cliente, '', c.whatsapp, vend, sub, v_desc, v_total,
        'entregado', trim('Liquidación de consignación ' || c.numero_pedido || ' ' || coalesce(p_notas,'')), 0, v_total,
        jsonb_build_array(jsonb_build_object('fecha', v_fecha, 'monto', v_total, 'nota', 'Liquidación de ' || c.numero_pedido)),
        'na', v_fecha, v_fecha, v_fecha, now(), v_fecha, 'total', c.id)
    returning id into v_id;
    v_num := 'V-' || lpad(v_id::text, 5, '0');
    update pedidos set numero_pedido = v_num where id = v_id;
  end if;

  update pedidos set items = nuevos, estado = case when hay_pend then 'consignado' else 'liquidado' end, updated_at = now()
   where id = p_id;
  return json_build_object('vendidas', tot_v, 'devueltas', tot_d, 'total_venta', coalesce(v_total, 0), 'venta', v_num, 'liquidada', not hay_pend);
end $$;

-- Anular una consignacion: regresa al inventario lo que sigue pendiente. Las ventas ya liquidadas se conservan.
create or replace function admin_anular_consignacion(p_pass text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c pedidos%rowtype; it jsonb; pend int;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into c from pedidos where id = p_id for update;
  if not found or c.tipo <> 'consignacion' then raise exception 'Consignación no existe'; end if;
  for it in select * from jsonb_array_elements(c.items) loop
    pend := (it->>'cantidad')::int - coalesce((it->>'vendido')::int, 0) - coalesce((it->>'devuelto')::int, 0);
    if pend > 0 then update productos set stock = stock + pend, updated_at = now() where id = (it->>'id')::bigint; end if;
  end loop;
  delete from pedidos where id = p_id;
end $$;

-- Una venta que nacio de una consignacion no se anula desde aqui (sus piezas ya salieron).
create or replace function admin_anular_venta(p_pass text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Venta no existe'; end if;
  if p.tipo <> 'venta' then raise exception 'Solo se pueden anular ventas registradas manualmente'; end if;
  if p.consignacion_id is not null then raise exception 'Esta venta viene de una liquidación de consignación y no se puede anular desde aquí'; end if;
  perform lessa_restock(p.items);
  delete from pedidos where id = p_id;
end $$;

grant execute on function admin_registrar_venta(text,date,text,text,jsonb,text,numeric,text,boolean,boolean) to anon, authenticated;
grant execute on function admin_liquidar_consignacion(text,bigint,jsonb,date,numeric,text) to anon, authenticated;
grant execute on function admin_anular_consignacion(text,bigint) to anon, authenticated;
grant execute on function admin_anular_venta(text,bigint) to anon, authenticated;
notify pgrst, 'reload schema';
