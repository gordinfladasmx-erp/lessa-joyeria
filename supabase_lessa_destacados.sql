-- Lessa: productos destacados. Pegar en Supabase > SQL Editor > Run. Se puede correr varias veces.
-- Arranca con destacados los productos que hoy tienen existencia (solo la primera vez).

alter table productos add column if not exists destacado boolean default false;
create index if not exists idx_productos_destacado on productos(destacado) where destacado;

update productos set destacado = true, updated_at = now()
 where stock > 0 and not exists (select 1 from productos where destacado);

create or replace function admin_set_destacado(p_pass text, p_id bigint, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not lessa_admin_ok(p_pass) then raise exception 'No autorizado'; end if;
  update productos set destacado = p_valor, updated_at = now() where id = p_id;
end $$;

grant execute on function admin_set_destacado(text,bigint,boolean) to anon, authenticated;
notify pgrst, 'reload schema';
