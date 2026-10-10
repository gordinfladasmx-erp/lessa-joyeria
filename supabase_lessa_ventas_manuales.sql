-- Lessa: registrar ventas manuales (mostrador, WhatsApp, redes) desde el panel. Descuentan inventario.
-- Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.

-- p_items: [{"id": <producto>, "cantidad": n, "precio": <opcional, si no, el del catalogo>}]
create or replace function admin_registrar_venta(
  p_pass text, p_fecha date, p_cliente text, p_telefono text, p_items jsonb,
  p_desc_tipo text default 'monto', p_desc_valor numeric default 0,
  p_notas text default '', p_forzar boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod productos%rowtype; qty int; prc numeric; line jsonb;
  v_items jsonb := '[]'::jsonb; v_sub numeric := 0; v_desc numeric := 0; v_total numeric;
  v_id bigint; v_num text; v_fecha timestamptz;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto'; end if;
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
    v_items := v_items || line;
    v_sub := v_sub + prc * qty;
  end loop;

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

-- Anular una venta manual: regresa las piezas al inventario y la borra.
create or replace function admin_anular_venta(p_pass text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p pedidos%rowtype;
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'Venta no existe'; end if;
  if p.tipo <> 'venta' then raise exception 'Solo se pueden anular ventas registradas manualmente'; end if;
  perform lessa_restock(p.items);
  delete from pedidos where id = p_id;
end $$;

grant execute on function admin_registrar_venta(text,date,text,text,jsonb,text,numeric,text,boolean) to anon, authenticated;
grant execute on function admin_anular_venta(text,bigint) to anon, authenticated;
notify pgrst, 'reload schema';
