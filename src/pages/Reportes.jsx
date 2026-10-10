import { useState, useEffect, useMemo } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import { sb } from '../lib/supabase'
import { money, mensajeError } from '../lib/store'

Chart.register(...registerables)

const COSTO = 0.5
const ROSA = '#A01848'
const PALETA = ['#A01848', '#D9779B', '#E8C4D6', '#6B6B65', '#C9A227', '#2E7D4F', '#378ADD', '#7F77DD', '#EF9F27', '#1D9E75', '#B3261E', '#9C9A92', '#5B2A86', '#00897B']

const RANGOS = [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['todo', 'Todo']]

function desde(r) {
  const d = new Date()
  if (r === 'hoy') { d.setHours(0, 0, 0, 0); return d }
  if (r === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (r === 'todo') return new Date(2000, 0, 1)
  d.setDate(d.getDate() - Number(r)); d.setHours(0, 0, 0, 0); return d
}

const unidades = (p) => p.items.reduce((s, i) => s + i.cantidad, 0)

function Kpi({ titulo, valor, sub, tono }) {
  return (
    <div className={`kpi ${tono || ''}`}>
      <span className="kpi-t">{titulo}</span>
      <strong>{valor}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function Grafica({ titulo, children, alto = 260 }) {
  return (
    <div className="grafica">
      <h3>{titulo}</h3>
      <div style={{ height: alto, position: 'relative' }}>{children}</div>
    </div>
  )
}

export default function Reportes({ pass }) {
  const [pedidos, setPedidos] = useState([])
  const [productos, setProductos] = useState([])
  const [cats, setCats] = useState([])
  const [rango, setRango] = useState('30')
  const [origen, setOrigen] = useState('todas')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const q = (a, b) => sb.from('productos').select('id,sku,nombre,precio,stock,categoria_id,activo').order('id').range(a, b)
      const [ped, c, p1, p2, p3] = await Promise.all([
        sb.rpc('admin_listar_pedidos', { p_pass: pass }),
        sb.from('categorias').select('*'),
        q(0, 999), q(1000, 1999), q(2000, 2999),
      ])
      if (ped.error) return setMsg(mensajeError(ped.error))
      setPedidos(ped.data || [])
      setCats(c.data || [])
      setProductos([...(p1.data || []), ...(p2.data || []), ...(p3.data || [])])
    })()
  }, [pass])

  const d = useMemo(() => {
    const ini = desde(rango)
    const nomCat = Object.fromEntries(cats.map((c) => [c.id, c.nombre]))
    const prod = Object.fromEntries(productos.map((p) => [p.id, p]))
    const fechaVenta = (p) => new Date(p.entregado_at || p.created_at)

    const ventas = pedidos.filter((p) => p.estado === 'entregado' && fechaVenta(p) >= ini &&
      (origen === 'todas' || (origen === 'manual' ? p.tipo === 'venta' : p.tipo !== 'venta')))
    const ingresos = ventas.reduce((s, p) => s + Number(p.total) - Number(p.envio || 0), 0)
    const envios = ventas.reduce((s, p) => s + Number(p.envio || 0), 0)
    const costo = ventas.reduce((s, p) => s + Number(p.subtotal || p.total) * COSTO, 0)
    const descuentos = ventas.reduce((s, p) => s + Number(p.descuento || 0), 0)
    const uds = ventas.reduce((s, p) => s + unidades(p), 0)

    let cobrado = 0
    pedidos.filter((p) => p.estado !== 'cancelado').forEach((p) => (p.pagos || []).forEach((x) => {
      if (new Date(x.fecha) >= ini) cobrado += Number(x.monto)
    }))

    const abiertos = pedidos.filter((p) => ['por_confirmar', 'confirmado'].includes(p.estado))
    const porCobrar = abiertos.reduce((s, p) => s + (Number(p.total) - Number(p.pagado)), 0)
    const deudores = Object.values(abiertos.reduce((m, p) => {
      const k = p.nombre_cliente + '|' + p.whatsapp
      m[k] = m[k] || { nombre: p.nombre_cliente, tel: p.whatsapp, saldo: 0, pedidos: 0 }
      m[k].saldo += Number(p.total) - Number(p.pagado); m[k].pedidos += 1
      return m
    }, {})).filter((x) => x.saldo > 0).sort((a, b) => b.saldo - a.saldo)

    const apartados = pedidos.filter((p) => p.tipo === 'apartado' && p.estado === 'confirmado')
    const encargos = pedidos.filter((p) => p.tipo === 'encargo' && ['por_confirmar', 'confirmado'].includes(p.estado))
    const porConfirmar = pedidos.filter((p) => p.estado === 'por_confirmar')
    const anticipos = abiertos.reduce((s, p) => s + Number(p.pagado), 0)

    const canc = pedidos.filter((p) => p.estado === 'cancelado' && new Date(p.cancelado_at || p.created_at) >= ini)
    const cancPor = (m) => canc.filter((p) => p.motivo_cancelacion === m)

    // series de tiempo
    const porMes = rango === 'todo'
    const clave = (dt) => (porMes ? dt.toISOString().slice(0, 7) : dt.toISOString().slice(0, 10))
    const serie = {}
    ventas.forEach((p) => {
      const k = clave(fechaVenta(p))
      serie[k] = serie[k] || { ing: 0, gan: 0, uds: 0 }
      serie[k].uds += unidades(p)
      serie[k].ing += Number(p.total) - Number(p.envio || 0)
      serie[k].gan += Number(p.total) - Number(p.envio || 0) - Number(p.subtotal || p.total) * COSTO
    })
    const claves = Object.keys(serie).sort()

    // por categoría y por producto
    const udsCat = {}; const top = {}
    ventas.forEach((p) => p.items.forEach((i) => {
      const c = nomCat[prod[i.id]?.categoria_id] || 'Otros'
      udsCat[c] = (udsCat[c] || 0) + i.cantidad
      top[i.sku] = top[i.sku] || { sku: i.sku, nombre: i.nombre, u: 0 }
      top[i.sku].u += i.cantidad
    }))
    const topArr = Object.values(top).sort((a, b) => b.u - a.u).slice(0, 10)

    // inventario
    const invCat = {}
    let piezas = 0, valorVenta = 0, agotados = 0
    productos.filter((p) => p.activo).forEach((p) => {
      const s = Number(p.stock) || 0
      piezas += s; valorVenta += s * p.precio
      if (s === 0) agotados += 1
      const c = nomCat[p.categoria_id] || 'Otros'
      invCat[c] = invCat[c] || { piezas: 0, valor: 0 }
      invCat[c].piezas += s; invCat[c].valor += s * p.precio * COSTO
    })

    const estados = {
      'Esperando reserva': porConfirmar.length,
      'Apartados vigentes': apartados.length,
      'Encargos con reserva': encargos.filter((p) => p.estado === 'confirmado').length,
      'Entregados (periodo)': ventas.length,
      'Cancelados (periodo)': canc.length,
    }
    return {
      ventas, ingresos, envios, costo, ganancia: ingresos - costo, descuentos, uds, cobrado, porCobrar, deudores,
      apartados, encargos, porConfirmar, anticipos, canc, cancPor, serie, claves, udsCat, topArr,
      invCat, piezas, valorVenta, agotados, estados,
      productosActivos: productos.filter((p) => p.activo).length,
    }
  }, [pedidos, productos, cats, rango, origen])

  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  const optsMoney = { ...opts, scales: { y: { ticks: { callback: (v) => '$' + v.toLocaleString('es-MX') } } } }
  const catsInv = Object.keys(d.invCat).sort((a, b) => d.invCat[b].valor - d.invCat[a].valor)
  const catsUds = Object.keys(d.udsCat).sort((a, b) => d.udsCat[b] - d.udsCat[a])
  const sinDatos = <p className="sin-datos">Sin datos en este periodo</p>

  return (
    <div className="reportes">
      {msg && <p className="admin-error">{msg}</p>}
      <div className="admin-subtabs">
        {RANGOS.map(([k, l]) => <button key={k} className={rango === k ? 'on' : ''} onClick={() => setRango(k)}>{l}</button>)}
      </div>
      <div className="admin-subtabs">
        {[['todas', 'Todas las ventas'], ['pagina', 'Pedidos de la página'], ['manual', 'Ventas manuales']].map(([k, l]) => (
          <button key={k} className={origen === k ? 'on' : ''} onClick={() => setOrigen(k)}>{l}</button>
        ))}
      </div>
      <p className="admin-nota">El costo de cada producto se calcula como el 50% de su precio de venta. Ventas = pedidos entregados y pagados.</p>

      <h2>Ventas del periodo</h2>
      <div className="kpis">
        <Kpi titulo="Ingresos" valor={money(d.ingresos)} sub={`${d.ventas.length} venta(s)`} />
        <Kpi titulo="Ganancia" valor={money(d.ganancia)} sub={d.ingresos ? `Margen ${Math.round((d.ganancia / d.ingresos) * 100)}%` : ''} tono="verde" />
        <Kpi titulo="Costo" valor={money(d.costo)} />
        <Kpi titulo="Unidades vendidas" valor={d.uds} />
        <Kpi titulo="Descuentos dados" valor={money(d.descuentos)} />
        <Kpi titulo="Envíos cobrados" valor={money(d.envios)} sub="no cuentan como ingreso" />
        <Kpi titulo="Cobrado (incluye reservas)" valor={money(d.cobrado)} />
      </div>

      <div className="graficas">
        <Grafica titulo={`Volumen (piezas) y ventas ($) por ${rango === 'todo' ? 'mes' : 'día'}`} alto={300}>
          {d.claves.length === 0 ? sinDatos : (
            <Bar options={{
              responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'bottom' } },
              scales: {
                y: { position: 'left', title: { display: true, text: 'Piezas' }, beginAtZero: true, ticks: { precision: 0 } },
                y2: { position: 'right', title: { display: true, text: 'Ventas ($)' }, beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: (v) => '$' + v.toLocaleString('es-MX') } },
              },
            }} data={{
              labels: d.claves,
              datasets: [
                { type: 'bar', label: 'Piezas vendidas', data: d.claves.map((k) => d.serie[k].uds), backgroundColor: '#D9779B', yAxisID: 'y' },
                { type: 'line', label: 'Ventas ($)', data: d.claves.map((k) => d.serie[k].ing), borderColor: ROSA, backgroundColor: ROSA, tension: 0.25, yAxisID: 'y2' },
              ],
            }} />
          )}
        </Grafica>
        <Grafica titulo={`Ingresos y ganancia por ${rango === 'todo' ? 'mes' : 'día'}`}>
          {d.claves.length === 0 ? sinDatos : (
            <Bar options={optsMoney} data={{
              labels: d.claves,
              datasets: [
                { label: 'Ingresos', data: d.claves.map((k) => d.serie[k].ing), backgroundColor: ROSA },
                { label: 'Ganancia', data: d.claves.map((k) => d.serie[k].gan), backgroundColor: '#2E7D4F' },
              ],
            }} />
          )}
        </Grafica>
        <Grafica titulo="Unidades vendidas por categoría">
          {catsUds.length === 0 ? sinDatos : (
            <Bar options={{ ...opts, plugins: { legend: { display: false } } }} data={{
              labels: catsUds, datasets: [{ data: catsUds.map((c) => d.udsCat[c]), backgroundColor: ROSA }],
            }} />
          )}
        </Grafica>
        <Grafica titulo="Top 10 productos vendidos" alto={320}>
          {d.topArr.length === 0 ? sinDatos : (
            <Bar options={{ ...opts, indexAxis: 'y', plugins: { legend: { display: false } } }} data={{
              labels: d.topArr.map((t) => t.sku), datasets: [{ data: d.topArr.map((t) => t.u), backgroundColor: '#D9779B' }],
            }} />
          )}
        </Grafica>
      </div>

      <h2>Cuentas por cobrar y reservas (hoy)</h2>
      <div className="kpis">
        <Kpi titulo="Cuentas por cobrar" valor={money(d.porCobrar)} sub={`${d.deudores.length} cliente(s)`} tono="rojo" />
        <Kpi titulo="Anticipos recibidos" valor={money(d.anticipos)} sub="de pedidos aún abiertos" />
        <Kpi titulo="Apartados vigentes" valor={d.apartados.length} sub={`${d.apartados.reduce((s, p) => s + unidades(p), 0)} pieza(s), ${money(d.apartados.reduce((s, p) => s + Number(p.total), 0))}`} />
        <Kpi titulo="Encargos abiertos" valor={d.encargos.length} sub={money(d.encargos.reduce((s, p) => s + Number(p.total), 0))} />
        <Kpi titulo="Esperando pago de reserva" valor={d.porConfirmar.length} />
      </div>
      <div className="graficas">
        <Grafica titulo="Pedidos por estado">
          {Object.values(d.estados).every((v) => !v) ? sinDatos : (
            <Doughnut options={opts} data={{ labels: Object.keys(d.estados), datasets: [{ data: Object.values(d.estados), backgroundColor: PALETA }] }} />
          )}
        </Grafica>
        <div className="grafica">
          <h3>Quién debe</h3>
          {d.deudores.length === 0 ? sinDatos : (
            <div className="tabla-scroll">
              <table className="admin-tabla">
                <thead><tr><th>Cliente</th><th>Teléfono</th><th>Pedidos</th><th>Saldo</th></tr></thead>
                <tbody>{d.deudores.map((x, k) => <tr key={k}><td>{x.nombre}</td><td>{x.tel}</td><td>{x.pedidos}</td><td className="por-cobrar">{money(x.saldo)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <h2>Inventario (hoy)</h2>
      <div className="kpis">
        <Kpi titulo="Piezas en existencia" valor={d.piezas} />
        <Kpi titulo="Valor a precio de venta" valor={money(d.valorVenta)} />
        <Kpi titulo="Valor a costo" valor={money(d.valorVenta * COSTO)} />
        <Kpi titulo="Productos agotados" valor={d.agotados} sub={`de ${d.productosActivos}`} tono={d.agotados ? 'rojo' : ''} />
      </div>
      <div className="graficas">
        <Grafica titulo="Piezas por categoría">
          <Doughnut options={opts} data={{ labels: catsInv, datasets: [{ data: catsInv.map((c) => d.invCat[c].piezas), backgroundColor: PALETA }] }} />
        </Grafica>
        <Grafica titulo="Valor del inventario a costo por categoría">
          <Bar options={{ ...optsMoney, plugins: { legend: { display: false } } }} data={{
            labels: catsInv, datasets: [{ data: catsInv.map((c) => d.invCat[c].valor), backgroundColor: ROSA }],
          }} />
        </Grafica>
      </div>

      <h2>Cancelaciones y anuladas (periodo)</h2>
      <div className="kpis">
        <Kpi titulo="Total canceladas" valor={d.canc.length} sub={money(d.canc.reduce((s, p) => s + Number(p.total), 0))} />
        <Kpi titulo="Anuladas por vencer (15 días)" valor={d.cancPor('vencido').length} />
        <Kpi titulo="Sin pago de reserva" valor={d.cancPor('sin_pago').length} />
        <Kpi titulo="Canceladas a mano" valor={d.cancPor('manual').length} />
        <Kpi titulo="Pagado por devolver" valor={money(d.canc.reduce((s, p) => s + Number(p.pagado), 0))} tono="rojo" />
      </div>
    </div>
  )
}
