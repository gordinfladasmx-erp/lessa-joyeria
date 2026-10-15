-- Lessa / Lumina: capas de inventario por costo. Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- (Requiere supabase_lessa_costo_pct.sql ya ejecutado.)
-- Cada entrada al inventario (inventario inicial, pedido al proveedor recibido) es una capa con su % de costo.
-- El stock real sigue siendo productos.stock; las piezas que salen se descuentan primero de las capas mas antiguas.

create table if not exists inventario_lotes (
  id bigserial primary key,
  producto_id bigint not null,
  origen text not null,                    -- 'inicial' | 'pedido'
  pedido_proveedor_id bigint,
  costo_pct numeric not null,
  cantidad int not null check (cantidad > 0),
  created_at timestamptz not null default now()
);
create index if not exists inventario_lotes_prod on inventario_lotes(producto_id);
alter table inventario_lotes enable row level security;

-- Lo que ya habia en inventario al instalar esto es el inventario inicial, al 50%.
insert into inventario_lotes(producto_id, origen, costo_pct, cantidad, created_at)
select id, 'inicial', 50, stock, '2000-01-01'
  from productos
 where stock > 0 and not exists (select 1 from inventario_lotes);

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
    insert into inventario_lotes(producto_id, origen, pedido_proveedor_id, costo_pct, cantidad)
      select id, 'pedido', p_batch_id, coalesce(b.costo_pct, 50), stock_add from productos where sku = p_sku;
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


-- Capas que SIGUEN en existencia por producto (las mas nuevas; lo vendido sale de las mas antiguas).
-- Si el stock es mayor que lo registrado en capas (ajustes manuales con +), el sobrante sale como 'ajuste' sin costo propio.
create or replace function admin_listar_lotes(p_pass text)
returns table(producto_id bigint, origen text, pedido_proveedor_id bigint, costo_pct numeric, cantidad int, fecha timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  return query
  with capas as (
    select l.producto_id, l.origen, l.pedido_proveedor_id, l.costo_pct, l.cantidad, l.created_at as fecha,
           coalesce(sum(l.cantidad) over (partition by l.producto_id order by l.created_at desc, l.id desc
                    rows between unbounded preceding and 1 preceding), 0) as mas_nuevas
      from inventario_lotes l
  ), vivas as (
    select c.producto_id, c.origen, c.pedido_proveedor_id, c.costo_pct,
           least(c.cantidad, greatest(p.stock - c.mas_nuevas, 0))::int as cantidad, c.fecha
      from capas c join productos p on p.id = c.producto_id
  ), sobrante as (
    select p.id as producto_id, 'ajuste'::text as origen, null::bigint as pedido_proveedor_id, null::numeric as costo_pct,
           (p.stock - coalesce(t.total, 0))::int as cantidad, now() as fecha
      from productos p
      left join (select producto_id, sum(cantidad) as total from inventario_lotes group by producto_id) t on t.producto_id = p.id
     where p.stock > coalesce(t.total, 0)
  )
  select v.producto_id, v.origen, v.pedido_proveedor_id, v.costo_pct, v.cantidad, v.fecha from vivas v where v.cantidad > 0
  union all
  select s.producto_id, s.origen, s.pedido_proveedor_id, s.costo_pct, s.cantidad, s.fecha from sobrante s;
end $$;

grant execute on function admin_confirmar_recepcion(text,bigint,text,int) to anon, authenticated;
grant execute on function admin_listar_lotes(text) to anon, authenticated;
notify pgrst, 'reload schema';
