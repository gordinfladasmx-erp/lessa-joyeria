-- ══════════════════════════════════════════════════════════════════════
-- CHILAKILEANDO ERP — Pedidos desde menú online
-- Ejecutar en Supabase SQL Editor (Settings > SQL Editor)
-- Necesario para que los pedidos de /menu aparezcan en el POS comanda
-- ══════════════════════════════════════════════════════════════════════

-- 1. Agregar columna notas_cliente si no existe
ALTER TABLE comandas_activas
  ADD COLUMN IF NOT EXISTS notas_cliente text;

-- 2. Política: usuarios anónimos (menú público) pueden insertar pedidos
DROP POLICY IF EXISTS "comandas_anon_insert" ON comandas_activas;
CREATE POLICY "comandas_anon_insert" ON comandas_activas
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

-- 3. Políticas: menú público puede leer catálogo (productos, familias, inventario)
DROP POLICY IF EXISTS "productos_anon_select" ON productos;
CREATE POLICY "productos_anon_select" ON productos
  FOR SELECT USING (auth.role() = 'anon');

DROP POLICY IF EXISTS "familias_anon_select" ON familias;
CREATE POLICY "familias_anon_select" ON familias
  FOR SELECT USING (auth.role() = 'anon');

DROP POLICY IF EXISTS "inv_maestro_anon_select" ON inventario_maestro;
CREATE POLICY "inv_maestro_anon_select" ON inventario_maestro
  FOR SELECT USING (auth.role() = 'anon');

-- 4. Horarios y cierres de emergencia (para saber si está abierto)
DROP POLICY IF EXISTS "horarios_anon_select" ON horarios;
CREATE POLICY "horarios_anon_select" ON horarios
  FOR SELECT USING (auth.role() = 'anon');

-- cierres_emergencia: si la tabla no existe, comentar las líneas siguientes
-- ALTER TABLE cierres_emergencia ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "cierres_emergencia_anon_select" ON cierres_emergencia;
-- CREATE POLICY "cierres_emergencia_anon_select" ON cierres_emergencia
--   FOR SELECT USING (true);

-- 5. ventas: solo lectura anónima para top_products en menú
DROP POLICY IF EXISTS "ventas_anon_select" ON ventas;
CREATE POLICY "ventas_anon_select" ON ventas
  FOR SELECT USING (auth.role() = 'anon');

-- 6. Habilitar Realtime para comandas_activas (si no está activado)
-- Nota: también habilitarlo en Supabase Dashboard > Database > Replication
-- ALTER PUBLICATION supabase_realtime ADD TABLE comandas_activas;

-- ══════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════════
-- Verificar que la columna existe:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'comandas_activas'
  AND column_name = 'notas_cliente';

-- Verificar políticas activas:
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'comandas_activas'
ORDER BY policyname;
