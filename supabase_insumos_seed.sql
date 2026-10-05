-- Catálogo inicial de insumos — nombres exactos del POS Chilakileando
-- Ejecutar en Supabase Dashboard → SQL Editor

-- 1. Agregar columna categoría si no existe
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Insumos';

-- 2. Insertar insumos con categoría
INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo, categoria) VALUES

-- ── BASES ────────────────────────────────────────────────────
('Totopos',           'bolsa', 0, 10,  'Bases'),
('Masa',              'kg',    0, 2,   'Bases'),

-- ── GUISOS ───────────────────────────────────────────────────
('Arroz',                     'g', 0, 500,  'Guisos'),
('Frijolitos de la Casa',      'g', 0, 500,  'Guisos'),
('Mole de la Casa',            'g', 0, 500,  'Guisos'),
('Picadillo',                  'g', 0, 500,  'Guisos'),
('Deshebrada a la Mexicana',   'g', 0, 500,  'Guisos'),
('Nopales',                    'g', 0, 300,  'Guisos'),
('Huevo',                      'g', 0, 300,  'Guisos'),
('Huevo Estrellado',           'g', 0, 200,  'Guisos'),
('Claras de Huevo',            'g', 0, 200,  'Guisos'),
('Bistec',                     'g', 0, 300,  'Guisos'),
('Pollo',                      'g', 0, 300,  'Guisos'),
('Arrachera',                  'g', 0, 300,  'Guisos'),
('Trocito de la Casa',         'g', 0, 300,  'Guisos'),
('Papas',                      'g', 0, 300,  'Guisos'),
('Rajas Poblanas',             'g', 0, 300,  'Guisos'),
('Chicharron Duro',            'g', 0, 200,  'Guisos'),
('Prensado de la Casa',        'g', 0, 300,  'Guisos'),

-- ── TOPPINGS ─────────────────────────────────────────────────
('Queso Sierra',      'g', 0, 500, 'Toppings'),
('Queso Asadero',     'g', 0, 500, 'Toppings'),
('Crema',             'g', 0, 500, 'Toppings'),

-- ── SALSAS ───────────────────────────────────────────────────
('Salsa Verde',        'l', 0, 2, 'Salsas'),
('Salsa Roja',         'l', 0, 2, 'Salsas'),
('Salsa Chipotle',     'l', 0, 1, 'Salsas'),
('Cremosa',            'l', 0, 1, 'Salsas'),
('La Cunada',          'l', 0, 1, 'Salsas'),
('Diabla',             'l', 0, 1, 'Salsas'),
('La Suegra',          'l', 0, 1, 'Salsas'),
('La Suegra + Diabla', 'l', 0, 1, 'Salsas'),
('Mole',               'l', 0, 1, 'Salsas')

ON CONFLICT DO NOTHING;

-- 3. Verificar
SELECT categoria, COUNT(*) as total FROM insumos GROUP BY categoria ORDER BY categoria;
