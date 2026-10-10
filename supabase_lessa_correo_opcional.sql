-- Lessa: en una venta de mostrador (con tu sesion) el correo y el telefono del cliente son opcionales.
-- En pedidos en linea siguen siendo obligatorios. Pegar en Supabase > SQL Editor > Run.

create or replace function crear_pedido(
  p_nombre text, p_email text, p_whatsapp text, p_notas text, p_items jsonb,
  p_modo text default 'apartado',
  p_desc_tipo text default 'monto', p_desc_valor numeric default 0,
  p_admin_pass text default '', p_venta_mostrador boolean default false,
  p_solicitud text default '', p_entrega text default 'recoger', p_direccion text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod productos%rowtype; qty int; pre boolean; urg boolean; serv text;
  v_norm jsonb := '[]'::jsonb; v_pn jsonb := '[]'::jsonb; v_pu jsonb := '[]'::jsonb; line jsonb;
  s_norm numeric := 0; s_pn numeric := 0; s_pu numeric := 0; v_sub numeric; v_desc numeric := 0;
  d_norm numeric := 0; d_pn numeric := 0; d_pu numeric := 0;
  t_norm numeric := 0; t_pn numeric := 0; t_pu numeric := 0;
  serv_max text := null; rank_max int := 0; r int;
  res jsonb := '[]'::jsonb; v_id bigint; v_num text; ant numeric; es_admin boolean;
  pct numeric := 0.30; fmodo text;
begin
  es_admin := lessa_admin_ok(p_admin_pass);
  if coalesce(trim(p_nombre),'') = '' then raise exception 'El nombre es obligatorio'; end if;
  -- En pedidos en linea el correo y el WhatsApp son obligatorios; en una venta de mostrador (personal) son opcionales.
  if not (es_admin and p_venta_mostrador) then
    if coalesce(trim(p_email),'') = '' then raise exception 'El correo es obligatorio'; end if;
    if coalesce(trim(p_whatsapp),'') = '' then raise exception 'El WhatsApp es obligatorio'; end if;
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Carrito vacío'; end if;
  perform vencer_apartados();
  fmodo := case when p_modo = 'total' then 'total' else 'apartado' end;

  for it in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, (it->>'cantidad')::int);
    pre := coalesce((it->>'preorden')::boolean, false);
    urg := coalesce((it->>'urgente')::boolean, false);
    serv := case when it->>'servicio' in ('guia','terrestre','express') then it->>'servicio' else null end;
    select * into prod from productos where id = (it->>'id')::bigint and activo for update;
    if not found then raise exception 'Producto no disponible: %', it->>'sku'; end if;
    line := jsonb_build_object('id', prod.id, 'sku', prod.sku, 'nombre', prod.nombre,
                               'precio', prod.precio, 'cantidad', qty);
    if pre then
      if prod.stock > 0 then
        raise exception 'El producto % ya tiene inventario; quítalo y agrégalo como disponible', prod.sku;
      end if;
      if urg then
        line := line || jsonb_build_object('servicio', coalesce(serv, 'guia'));
        r := case coalesce(serv,'guia') when 'express' then 3 when 'terrestre' then 2 else 1 end;
        if r > rank_max then rank_max := r; serv_max := coalesce(serv,'guia'); end if;
        v_pu := v_pu || line; s_pu := s_pu + prod.precio * qty;
      else
        v_pn := v_pn || line; s_pn := s_pn + prod.precio * qty;
      end if;
    else
      if prod.stock < qty then
        raise exception 'Sin inventario suficiente de % (disponibles: %)', prod.sku, prod.stock;
      end if;
      update productos set stock = stock - qty, updated_at = now() where id = prod.id;
      v_norm := v_norm || line; s_norm := s_norm + prod.precio * qty;
    end if;
  end loop;

  v_sub := s_norm + s_pn + s_pu;
  if es_admin and coalesce(p_desc_valor,0) > 0 then
    v_desc := case when p_desc_tipo = 'porcentaje'
                   then v_sub * least(p_desc_valor,100) / 100 else least(p_desc_valor, v_sub) end;
  end if;
  if v_sub > 0 then
    d_norm := round(v_desc * s_norm / v_sub, 2);
    d_pn   := round(v_desc * s_pn / v_sub, 2);
    d_pu   := v_desc - d_norm - d_pn;
  end if;
  t_norm := s_norm - d_norm;  t_pn := s_pn - d_pn;  t_pu := s_pu - d_pu;

  if jsonb_array_length(v_norm) > 0 then
    ant := case when p_modo = 'total' or p_venta_mostrador then t_norm else round(t_norm * pct, 2) end;
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento,
        total, estado, notas, anticipo_requerido, pagado, proveedor_estado,
        descuento_solicitado, entrega_tipo, direccion, modo_pago, validado_at)
    values ('TMP'||clock_timestamp()::text, 'apartado', p_nombre, p_email, p_whatsapp, v_norm, s_norm, d_norm,
        t_norm, 'por_confirmar', p_notas, ant, 0, 'na',
        p_solicitud, p_entrega, p_direccion, fmodo, case when es_admin then now() end) returning id into v_id;
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

  if jsonb_array_length(v_pn) > 0 then
    ant := case when p_modo = 'total' then t_pn else round(t_pn * pct, 2) end;
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento,
        total, estado, notas, anticipo_requerido, pagado, proveedor_estado, entrega_estimada,
        descuento_solicitado, entrega_tipo, direccion, modo_pago, validado_at, urgente)
    values ('TMP'||clock_timestamp()::text, 'encargo', p_nombre, p_email, p_whatsapp, v_pn, s_pn, d_pn,
        t_pn, 'por_confirmar', p_notas, ant, 0, 'na', current_date + 30,
        p_solicitud, p_entrega, p_direccion, fmodo, case when es_admin then now() end, false) returning id into v_id;
    v_num := 'LESSA-' || lpad(v_id::text, 5, '0') || '-E';
    update pedidos set numero_pedido = v_num where id = v_id;
    res := res || jsonb_build_object('id', v_id, 'numero_pedido', v_num, 'tipo', 'encargo', 'urgente', false, 'items', v_pn,
        'subtotal', s_pn, 'descuento', d_pn, 'total', t_pn, 'anticipo', ant, 'mostrador', false,
        'entrega_estimada', current_date + 30, 'validado', es_admin);
  end if;

  if jsonb_array_length(v_pu) > 0 then
    ant := case when p_modo = 'total' then t_pu else round(t_pu * pct, 2) end;
    insert into pedidos(numero_pedido, tipo, nombre_cliente, email_cliente, whatsapp, items, subtotal, descuento,
        total, estado, notas, anticipo_requerido, pagado, proveedor_estado, entrega_estimada,
        descuento_solicitado, entrega_tipo, direccion, modo_pago, validado_at, urgente, servicio_envio)
    values ('TMP'||clock_timestamp()::text, 'encargo', p_nombre, p_email, p_whatsapp, v_pu, s_pu, d_pu,
        t_pu, 'por_confirmar', p_notas, ant, 0, 'na', current_date + 15,
        p_solicitud, p_entrega, p_direccion, fmodo, case when es_admin then now() end, true, serv_max) returning id into v_id;
    v_num := 'LESSA-' || lpad(v_id::text, 5, '0') || '-U';
    update pedidos set numero_pedido = v_num where id = v_id;
    res := res || jsonb_build_object('id', v_id, 'numero_pedido', v_num, 'tipo', 'encargo', 'urgente', true,
        'servicio_envio', serv_max, 'items', v_pu,
        'subtotal', s_pu, 'descuento', d_pu, 'total', t_pu, 'anticipo', ant, 'mostrador', false,
        'entrega_estimada', current_date + 15, 'validado', es_admin);
  end if;

  return json_build_object('pedidos', res, 'total', t_norm + t_pn + t_pu);
end $$;

grant execute on function crear_pedido(text,text,text,text,jsonb,text,text,numeric,text,boolean,text,text,text) to anon, authenticated;
notify pgrst, 'reload schema';
