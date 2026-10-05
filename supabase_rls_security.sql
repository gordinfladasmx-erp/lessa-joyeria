-- ══════════════════════════════════════════════════════════════════════
-- CHILAKILEANDO ERP — Row Level Security + CORS
-- Ejecutar en Supabase SQL Editor (Settings > SQL Editor)
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. HABILITAR RLS EN TODAS LAS TABLAS ─────────────────────────────
-- Esto bloquea TODO acceso por defecto hasta que añadas una política.

ALTER TABLE ventas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_dia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandas_activas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE familias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_cat        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faltantes_caja    ENABLE ROW LEVEL SECURITY;
ALTER TABLE traspasos_caja    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_maestro ENABLE ROW LEVEL SECURITY;
ALTER TABLE produccion        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_respuestas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordatorios     ENABLE ROW LEVEL SECURITY;

-- Tablas opcionales (comentar si no existen)
-- ALTER TABLE almacen        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE crm_clientes   ENABLE ROW LEVEL SECURITY;

-- ── 2. FUNCIONES HELPER — obtener rol del usuario actual ─────────────
-- get_user_role() → usado en políticas RLS (SECURITY DEFINER para evitar
--   recursión: las políticas de user_roles no aplican al propio definer)
-- get_my_role()   → alias expuesto como RPC REST para las Netlify functions

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Alias público consumido vía /rest/v1/rpc/get_my_role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT get_user_role();
$$;

-- Permisos explícitos para que el rol anon/authenticated pueda invocarlas
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_role()   TO authenticated, anon;

-- ── 3. POLÍTICA BASE — usuario autenticado puede leer/escribir ────────
-- Solo usuarios que hayan hecho login con Supabase Auth tienen acceso.
-- Reemplaza "tabla" por cada tabla relevante.

-- Patrón de política que se repite:
--   SELECT (leer): cualquier usuario autenticado
--   INSERT/UPDATE/DELETE: solo admin o mesero (no viewer)

-- ─── ventas ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_select" ON ventas;
CREATE POLICY "ventas_select" ON ventas
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ventas_insert" ON ventas;
CREATE POLICY "ventas_insert" ON ventas
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'mesero'));

DROP POLICY IF EXISTS "ventas_update" ON ventas;
CREATE POLICY "ventas_update" ON ventas
  FOR UPDATE USING (get_user_role() IN ('admin', 'mesero'));

DROP POLICY IF EXISTS "ventas_delete" ON ventas;
CREATE POLICY "ventas_delete" ON ventas
  FOR DELETE USING (get_user_role() = 'admin');

-- ─── gastos ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gastos_select" ON gastos;
CREATE POLICY "gastos_select" ON gastos
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "gastos_insert" ON gastos;
CREATE POLICY "gastos_insert" ON gastos
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'mesero'));

DROP POLICY IF EXISTS "gastos_update" ON gastos;
CREATE POLICY "gastos_update" ON gastos
  FOR UPDATE USING (get_user_role() IN ('admin', 'mesero'));

DROP POLICY IF EXISTS "gastos_delete" ON gastos;
CREATE POLICY "gastos_delete" ON gastos
  FOR DELETE USING (get_user_role() = 'admin');

-- ─── cierres_dia ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cierres_select" ON cierres_dia;
CREATE POLICY "cierres_select" ON cierres_dia
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cierres_write" ON cierres_dia;
CREATE POLICY "cierres_write" ON cierres_dia
  FOR ALL USING (get_user_role() IN ('admin', 'mesero'));

-- ─── comandas_activas ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "comandas_select" ON comandas_activas;
CREATE POLICY "comandas_select" ON comandas_activas
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "comandas_write" ON comandas_activas;
CREATE POLICY "comandas_write" ON comandas_activas
  FOR ALL USING (get_user_role() IN ('admin', 'mesero'));

-- Pedidos desde menú público (/menu) — usuarios anónimos solo pueden insertar
DROP POLICY IF EXISTS "comandas_anon_insert" ON comandas_activas;
CREATE POLICY "comandas_anon_insert" ON comandas_activas
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

-- ─── productos y familias (catálogo) ─────────────────────────────────
DROP POLICY IF EXISTS "productos_select" ON productos;
CREATE POLICY "productos_select" ON productos
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "productos_write" ON productos;
CREATE POLICY "productos_write" ON productos
  FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "familias_select" ON familias;
CREATE POLICY "familias_select" ON familias
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "familias_write" ON familias;
CREATE POLICY "familias_write" ON familias
  FOR ALL USING (get_user_role() = 'admin');

-- ─── proveedores ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "proveedores_select" ON proveedores;
CREATE POLICY "proveedores_select" ON proveedores
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "proveedores_write" ON proveedores;
CREATE POLICY "proveedores_write" ON proveedores
  FOR ALL USING (get_user_role() IN ('admin', 'mesero'));

-- ─── ventas_cat ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_cat_select" ON ventas_cat;
CREATE POLICY "ventas_cat_select" ON ventas_cat
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ventas_cat_write" ON ventas_cat;
CREATE POLICY "ventas_cat_write" ON ventas_cat
  FOR ALL USING (get_user_role() IN ('admin', 'mesero'));

-- ─── faltantes + traspasos ────────────────────────────────────────────
DROP POLICY IF EXISTS "faltantes_rls" ON faltantes_caja;
CREATE POLICY "faltantes_rls" ON faltantes_caja
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "traspasos_rls" ON traspasos_caja;
CREATE POLICY "traspasos_rls" ON traspasos_caja
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── inventario ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "inv_diario_rls" ON inventario_diario;
CREATE POLICY "inv_diario_rls" ON inventario_diario
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "inv_maestro_rls" ON inventario_maestro;
CREATE POLICY "inv_maestro_rls" ON inventario_maestro
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "produccion_rls" ON produccion;
CREATE POLICY "produccion_rls" ON produccion
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── préstamos — solo admin ────────────────────────────────────────────
DROP POLICY IF EXISTS "prestamos_select" ON prestamos;
CREATE POLICY "prestamos_select" ON prestamos
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "prestamos_write" ON prestamos;
CREATE POLICY "prestamos_write" ON prestamos
  FOR ALL USING (get_user_role() = 'admin');

-- ─── NPS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "nps_select" ON nps_respuestas;
CREATE POLICY "nps_select" ON nps_respuestas
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "nps_insert" ON nps_respuestas;
CREATE POLICY "nps_insert" ON nps_respuestas
  FOR INSERT WITH CHECK (true);  -- encuestas pueden ser anónimas

-- ─── horarios + config ────────────────────────────────────────────────
DROP POLICY IF EXISTS "horarios_select" ON horarios;
CREATE POLICY "horarios_select" ON horarios
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "horarios_write" ON horarios;
CREATE POLICY "horarios_write" ON horarios
  FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "config_select" ON config_comisiones;
CREATE POLICY "config_select" ON config_comisiones
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "config_write" ON config_comisiones;
CREATE POLICY "config_write" ON config_comisiones
  FOR ALL USING (get_user_role() = 'admin');

-- ─── user_roles — solo el propio usuario puede leer su rol ────────────
DROP POLICY IF EXISTS "user_roles_select" ON user_roles;
CREATE POLICY "user_roles_select" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_write" ON user_roles;
CREATE POLICY "user_roles_write" ON user_roles
  FOR ALL USING (get_user_role() = 'admin');

-- ─── recordatorios ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recordatorios_rls" ON recordatorios;
CREATE POLICY "recordatorios_rls" ON recordatorios
  FOR ALL USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — ejecuta esto para confirmar que RLS está activo
-- ══════════════════════════════════════════════════════════════════════
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verifica que las funciones existen y tienen los permisos correctos
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_user_role', 'get_my_role');

-- ══════════════════════════════════════════════════════════════════════
-- CORS — configurar en Supabase Dashboard (no se hace por SQL):
--
-- 1. Authentication > URL Configuration
--    Site URL:              https://chilakileando-erp.netlify.app
--    Redirect URLs (añadir):
--      https://chilakileando-erp.netlify.app/**
--      http://localhost:5173/**
--
-- 2. Settings > API > CORS
--    Allowed Origins (añadir, una por línea):
--      https://chilakileando-erp.netlify.app
--      http://localhost:5173
--
-- Nota: solo la URL de producción en prod; localhost es solo para desarrollo.
-- ══════════════════════════════════════════════════════════════════════
