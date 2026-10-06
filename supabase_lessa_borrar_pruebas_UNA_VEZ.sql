-- Lessa: BORRAR TODAS LAS PRUEBAS. Ejecutar UNA SOLA VEZ.
-- Borra pedidos, ventas, apartados, encargos, pedidos al proveedor y su historial; reinicia la numeracion
-- (el primer pedido real sera LESSA-00001) y deja el inventario en 1 pieza solo en los 40 codigos reales.

delete from pedidos;

do $$ begin
  if to_regclass('public.pedidos_proveedor') is not null then delete from pedidos_proveedor; alter table pedidos_proveedor alter column id restart with 1; end if;
  if to_regclass('public.proveedor_lineas') is not null then delete from proveedor_lineas; alter table proveedor_lineas alter column id restart with 1; end if;
end $$;

alter table pedidos alter column id restart with 1;

update productos set stock = 0, updated_at = now();
update productos set stock = 1, updated_at = now() where sku in ('30003', '30006', '31176', '31820', '32128', '34044', '34172', '34697', '22652', '64948', '64959', '65000', '96353', '96359', '96361', '96370', '96371', '97550', '97567', '97645', '40593', '40605', '41768', '41903', '46018', '81051', '81052', '81053', '81066', '81067', '81072', '81074', '81084', '80799', '82904', '86118', '86888', '86892', '86894', '86915');

select (select count(*) from pedidos) as pedidos, (select count(*) from productos where stock > 0) as productos_con_existencia, (select coalesce(sum(stock),0) from productos) as piezas;
