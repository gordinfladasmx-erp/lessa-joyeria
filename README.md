# Lessa Joyería - Ecommerce

Tienda de joyería online construida con React + Vite + Supabase + Netlify.

## Stack

- **Frontend**: React 18 + Vite
- **Backend**: Supabase (PostgreSQL)
- **Hosting**: Netlify
- **Versionamiento**: GitHub

## Características

- Landing page con información de la tienda
- Catálogo de 1985 joyería con 14 categorías
- Carrito de compras (almacenado localmente)
- Sistema de pedidos
- 2250 fotos optimizadas

## Estructura

```
src/
  pages/
    Landing.jsx      - Página de inicio
    Catalogo.jsx     - Catálogo de productos
    Carrito.jsx      - Carrito de compras
  lib/
    supabase.js      - Cliente Supabase
  App.jsx            - App principal
  App.css            - Estilos
```

## Instalación

```bash
npm install
npm run dev       # Desarrollo
npm run build     # Producción
```

## Variables de entorno

Crear `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

## Deploy

1. Push a GitHub
2. Conectar en Netlify (automático desde GitHub)
3. Configurar variables de entorno en Netlify

## Datos

- Productos: `/supabase_lessa_insert.sql`
- Fotos: `/Users/bps/Downloads/lessa_fotos_optimizadas/`
- Schema: `/supabase_lessa_schema.sql`

## Pasos siguientes

1. Crear repo en GitHub: `lessa-joyeria`
2. Crear proyecto en Supabase
3. Ejecutar schema SQL
4. Ejecutar insert SQL (con fotos)
5. Configurar Netlify
6. Deploy

---

Hecho por Claude Code
