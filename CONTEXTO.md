Estado actual del proyecto — Apr 19, 2026 (fin de sesion)

BD Supabase — agregado hoy:
* Familia "Platos a la Carta" (codigo PLA) en tabla familias
* Producto "Plato a la Carta" (PLA-01, $100 base, $20 guiso extra) en productos
* Folios retroactivos asignados a 4 ventas del 19-abr que estaban con folio=null

BD Supabase — del dia anterior:
* horarios, user_roles (con nombre y dias_permitidos)
* ventas.folio + funcion generar_folio(fecha, prefijo)
* Funcion is_admin() SECURITY DEFINER
* Politica RLS "lectura user_roles" — admin lee todas las filas

Usuarios actuales:
* admin@chilakileando.com — Administrador
* mesero@chilakileando.com — Mesero General (todos los dias)
* regina@chilakileando.com — Mesero, solo sabados
* fer@chilakileando.com — Mesero, solo domingos
* viewer@chilakileando.com — Solo lectura

Lo que funciona hoy:
* Folios unicos por comanda (E/T/P/M/G-YYYYMMDD-001)
* Historial de ventas agrupado por folio
* Impresion termica via RawBT
* Ticket PDF con logo, QR y telefono
* Botones Mesa / Para llevar / Plataforma en comanda
* Modo plataforma con canal, numero de orden y cliente
* 3 guisos sin costo en Rellenos, Botijones, Huevos Rellenos
* Estado "cuenta_pedida"
* Dashboard abre en hoy por default
* Meta de 100 unidades diarias
* Horarios de trabajo configurables
* Meseros bloqueados fuera de horario
* Dias permitidos por usuario
* Admin Usuarios muestra correctamente el rol
* Categoria "Platos a la Carta" — $100 base + 2 guisos incluidos + hasta 3 extras a +$20
* Asignacion de productos por persona (P1, P2, P3...) en mesas
* KDS Cocina muestra items agrupados por persona

Resuelto hoy:
* Bug folios SIN-: eran ventas viejas con folio=null. Se asignaron
  folios retroactivos via SQL. Sistema actual funciona OK.
* Bug fecha en Gastos: EMPTY era objeto fijo, se quedaba la fecha
  del primer render. Fix: convertido a funcion EMPTY() que siempre
  regresa fecha actual.

Pendiente al abrir el nuevo chat:
* Fase 2 de cuentas separadas — al cobrar elegir "Junta" o "Separadas"
  con folio y ticket por persona (complejidad alta, tocar ejecutarCobro)
* Funcionalidad de voz para comandas (VITE_ANTHROPIC_KEY en Netlify)
* Probar impresora RawBT con papel y ajustar logo

Archivos backup creados hoy (por si algo falla):
* src/pages/Comanda.jsx.backup-personas
* src/pages/KDS.jsx.backup-personas
* src/pages/Gastos.jsx.backup-fecha

---
Nota para proxima sesion (Apr 19 fin):
* Fase 2 cuentas separadas NO es prioridad — la comanda ya muestra
  total por persona, meseros pueden dividir manualmente.
* Prioridad siguiente: COMANDAS POR VOZ con Claude API.
* Antes de arrancar proxima sesion, configurar VITE_ANTHROPIC_KEY
  en Netlify (ver console.anthropic.com → Settings → API Keys).

Update (Apr 19, cierre definitivo):
* VITE_ANTHROPIC_KEY ya configurada en Netlify — lista para usar
  cuando arranquemos comandas por voz en la proxima sesion.

Update (Apr 19, cierre definitivo):
* VITE_ANTHROPIC_KEY ya configurada en Netlify — lista para usar.
* Siguiente sesion: COMANDAS POR VOZ (MVP ~1.5-2 horas).
  Plan: boton microfono en Comanda → grabar audio → Claude API
  transcribe e interpreta → confirmar productos → agregar a comanda.
