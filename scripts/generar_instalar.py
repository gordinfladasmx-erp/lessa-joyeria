#!/usr/bin/env python3
"""Genera instalar.sql: un solo archivo para pegar en Supabase > SQL Editor al crear una tienda nueva.

Uso:
  python3 scripts/generar_instalar.py --prefijo LUMINA --clave MiClaveSegura --categorias "Aretes,Collares,Pulseras,Anillos" --salida instalar.sql
"""
import argparse, os, sys

ORDEN = [
    'supabase_lessa_schema.sql',
    'supabase_lessa_inventario_pedidos.sql',
    'supabase_lessa_proveedor_lineas.sql',
    'supabase_lessa_recepcion.sql',
    'supabase_lessa_borrar.sql',
    'supabase_lessa_destacados.sql',
    'supabase_lessa_ocultar.sql',
    'supabase_lessa_borrar_productos.sql',
    'supabase_lessa_pedido_urgente.sql',
    'supabase_lessa_ventas_manuales.sql',
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--prefijo', required=True, help='Prefijo de los folios de pedido, ej. LUMINA (da LUMINA-00001)')
    ap.add_argument('--clave', required=True, help='Contraseña del panel / código de autorización')
    ap.add_argument('--categorias', default='', help='Categorías iniciales separadas por coma')
    ap.add_argument('--salida', default='instalar.sql')
    a = ap.parse_args()
    if "'" in a.clave:
        sys.exit('La clave no puede llevar comillas simples.')
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    partes = [f"-- INSTALACION COMPLETA DE LA TIENDA ({a.prefijo})\n-- Pegar COMPLETO en Supabase > SQL Editor > Run, una sola vez, en un proyecto nuevo.\n"]
    for f in ORDEN:
        txt = open(os.path.join(raiz, f), encoding='utf-8').read()
        txt = txt.replace("'LESSA-'", f"'{a.prefijo.upper()}-'").replace("lessa2024", a.clave)
        partes.append(f"\n-- ======== {f} ========\n{txt}")
    cats = [c.strip() for c in a.categorias.split(',') if c.strip()]
    if cats:
        vals = ', '.join("'" + c.replace("'", "''") + "'" for c in cats)
        partes.append(f"\n-- ======== Categorias iniciales ========\ninsert into categorias(nombre) select x from unnest(array[{vals}]) x where not exists (select 1 from categorias c where lower(c.nombre) = lower(x));\n")
    open(a.salida, 'w', encoding='utf-8').write(''.join(partes))
    print(f'Listo: {a.salida} ({len(cats)} categorias, prefijo {a.prefijo.upper()})')

if __name__ == '__main__':
    main()
