-- ============================================================
-- MIGRACIÓN: Módulo de Insumos y Recetas
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Catálogo de insumos (ingredientes con unidad y stock)
CREATE TABLE IF NOT EXISTS insumos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL,
  unidad      TEXT NOT NULL,          -- 'g' | 'kg' | 'bolsa' | 'ml' | 'l' | 'pieza'
  stock_actual NUMERIC DEFAULT 0,
  stock_minimo NUMERIC DEFAULT 0,     -- alerta cuando stock_actual <= stock_minimo
  activo      BOOLEAN DEFAULT TRUE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Recetas: qué insumos lleva cada producto del menú
--    tipo: 'fijo'    → siempre se descuenta (ej: totopos)
--          'guiso'   → se descuenta del insumo cuyo nombre coincide con item._guiso
--          'salsa'   → se descuenta del insumo cuyo nombre coincide con item._salsa
CREATE TABLE IF NOT EXISTS recetas (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_codigo  TEXT NOT NULL,
  insumo_id        UUID REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad         NUMERIC NOT NULL,
  tipo             TEXT NOT NULL DEFAULT 'fijo'
);

-- 3. Historial de movimientos de stock
CREATE TABLE IF NOT EXISTS insumos_movimientos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  insumo_id   UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad    NUMERIC NOT NULL,    -- negativo = consumo, positivo = compra/ajuste
  tipo        TEXT NOT NULL,       -- 'venta' | 'compra' | 'ajuste'
  comanda_id  TEXT,
  nota        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para evitar doble descuento por comanda
CREATE UNIQUE INDEX IF NOT EXISTS insumos_mov_dedup
  ON insumos_movimientos(comanda_id, insumo_id)
  WHERE tipo = 'venta';

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE insumos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos_movimientos ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden leer y escribir todo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insumos' AND policyname='insumos_auth') THEN
    CREATE POLICY insumos_auth ON insumos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recetas' AND policyname='recetas_auth') THEN
    CREATE POLICY recetas_auth ON recetas FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insumos_movimientos' AND policyname='insumos_mov_auth') THEN
    CREATE POLICY insumos_mov_auth ON insumos_movimientos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- Verificar que todo quedó bien
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('insumos','recetas','insumos_movimientos')
ORDER BY table_name;
