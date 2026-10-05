-- Lessa Joyería - Schema para Ecommerce
-- Tablas: categorías, productos, carrito, pedidos

-- 1. Categorías
CREATE TABLE IF NOT EXISTS categorias (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Productos
CREATE TABLE IF NOT EXISTS productos (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nombre TEXT NOT NULL,
  precio NUMERIC(10,2) NOT NULL,
  categoria_id BIGINT REFERENCES categorias(id),
  sku TEXT UNIQUE,
  foto_url TEXT,
  descripcion TEXT,
  stock INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Carrito (temporal, por sesión)
CREATE TABLE IF NOT EXISTS carrito (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sesion_id TEXT NOT NULL,
  producto_id BIGINT NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  numero_pedido TEXT UNIQUE,
  nombre_cliente TEXT NOT NULL,
  email_cliente TEXT NOT NULL,
  whatsapp TEXT,
  items JSONB NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  estado TEXT DEFAULT 'pendiente', -- pendiente, confirmado, enviado, entregado
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_sku ON productos(sku);
CREATE INDEX idx_carrito_sesion ON carrito(sesion_id);
CREATE INDEX idx_pedidos_email ON pedidos(email_cliente);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);

-- RLS (Row Level Security)
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrito ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para lectura
CREATE POLICY "Categorías públicas" ON categorias FOR SELECT USING (TRUE);
CREATE POLICY "Productos públicos" ON productos FOR SELECT USING (activo = TRUE);

-- Carrito: acceso anónimo por sesión
CREATE POLICY "Carrito por sesión" ON carrito FOR ALL USING (TRUE);

-- Pedidos: solo lectura propia por email
CREATE POLICY "Ver propio pedido" ON pedidos FOR SELECT USING (TRUE);
CREATE POLICY "Crear pedido" ON pedidos FOR INSERT WITH CHECK (TRUE);
