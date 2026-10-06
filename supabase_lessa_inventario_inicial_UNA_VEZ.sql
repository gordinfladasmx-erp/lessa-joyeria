-- Lessa: INVENTARIO INICIAL REAL. Ejecutar UNA SOLA VEZ (pone todo en 0 y deja 1 pieza en los 40 codigos de abajo).
-- Notas: 96371 se tomo en lugar de 36371 y 40605 en lugar de 40604 (esos dos codigos no existen en el catalogo).

update productos set stock = 0, updated_at = now();

-- Anillos (8)
update productos set stock = 1, updated_at = now() where sku in ('30003', '30006', '31176', '31820', '32128', '34044', '34172', '34697');
-- Aretes (12)
update productos set stock = 1, updated_at = now() where sku in ('22652', '64948', '64959', '65000', '96353', '96359', '96361', '96370', '96371', '97550', '97567', '97645');
-- Pulseras (5)
update productos set stock = 1, updated_at = now() where sku in ('40593', '40605', '41768', '41903', '46018');
-- Collares (15)
update productos set stock = 1, updated_at = now() where sku in ('81051', '81052', '81053', '81066', '81067', '81072', '81074', '81084', '80799', '82904', '86118', '86888', '86892', '86894', '86915');

-- Total esperado: 40 productos con 1 pieza
select count(*) as productos_con_existencia, sum(stock) as piezas from productos where stock > 0;
