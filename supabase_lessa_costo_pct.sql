-- Lessa / Lumina: costo por pedido. Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- costo_pct = costo del producto como % del precio de venta (60% de descuento del proveedor = 40).
-- Cada pedido y cada pedido al proveedor guardan su propio % (no cambia el pasado si luego cambia el vigente).

create table if not exists ajustes (clave text primary key, valor numeric not null);
alter table ajustes enable row level security;
insert into ajustes(clave, valor) values ('costo_pct', 40) on conflict (clave) do nothing;

alter table pedidos add column if not exists costo_pct numeric;
alter table pedidos_proveedor add column if not exists costo_pct numeric;
-- Lo registrado hasta hoy se calculo al 50%.
update pedidos set costo_pct = 50 where costo_pct is null;
update pedidos_proveedor set costo_pct = 50 where costo_pct is null;

create or replace function costo_pct_vigente() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from ajustes where clave = 'costo_pct'), 40) $$;

-- Todo registro nuevo nace con el % vigente (las ventas por liquidacion heredan el de su consignacion).
create or replace function trg_costo_pct() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.costo_pct is null then
    if tg_table_name = 'pedidos' and to_jsonb(new)->>'consignacion_id' is not null then
      select costo_pct into new.costo_pct from pedidos where id = (to_jsonb(new)->>'consignacion_id')::bigint;
    end if;
    new.costo_pct := coalesce(new.costo_pct, costo_pct_vigente());
  end if;
  return new;
end $$;

drop trigger if exists costo_pct_pedidos on pedidos;
create trigger costo_pct_pedidos before insert on pedidos for each row execute function trg_costo_pct();
drop trigger if exists costo_pct_prov on pedidos_proveedor;
create trigger costo_pct_prov before insert on pedidos_proveedor for each row execute function trg_costo_pct();

create or replace function admin_costo_vigente(p_pass text) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  return costo_pct_vigente();
end $$;

create or replace function admin_set_costo_vigente(p_pass text, p_pct numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if p_pct is null or p_pct <= 0 or p_pct > 100 then raise exception 'El costo debe estar entre 1 y 100 por ciento'; end if;
  insert into ajustes(clave, valor) values ('costo_pct', p_pct)
    on conflict (clave) do update set valor = excluded.valor;
end $$;

create or replace function admin_set_costo_pedido(p_pass text, p_id bigint, p_pct numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if p_pct is null or p_pct <= 0 or p_pct > 100 then raise exception 'El costo debe estar entre 1 y 100 por ciento'; end if;
  update pedidos set costo_pct = p_pct where id = p_id;
  -- una consignacion y las ventas que salen de ella comparten el costo
  if exists (select 1 from information_schema.columns where table_name = 'pedidos' and column_name = 'consignacion_id') then
    execute 'update pedidos set costo_pct = $1 where consignacion_id = $2' using p_pct, p_id;
  end if;
end $$;

create or replace function admin_set_costo_lote(p_pass text, p_id bigint, p_pct numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  if p_pct is null or p_pct <= 0 or p_pct > 100 then raise exception 'El costo debe estar entre 1 y 100 por ciento'; end if;
  update pedidos_proveedor set costo_pct = p_pct where id = p_id;
end $$;

grant execute on function admin_costo_vigente(text) to anon, authenticated;
grant execute on function admin_set_costo_vigente(text,numeric) to anon, authenticated;
grant execute on function admin_set_costo_pedido(text,bigint,numeric) to anon, authenticated;
grant execute on function admin_set_costo_lote(text,bigint,numeric) to anon, authenticated;
notify pgrst, 'reload schema';
