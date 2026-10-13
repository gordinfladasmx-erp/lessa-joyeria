// Contenido de la guia de uso (solo se muestra con la sesion del panel iniciada).
// {{NOMBRE}}, {{CORTO}} y {{WORDMARK}} se reemplazan con los datos de config.js.
export const GUIA_HTML = `<header class="cover">
  <div class="cover-in">
    <img alt="{{NOMBRE}}" src="{{WORDMARK}}">
    <div>
      <h1>Guía de uso de la tienda</h1>
      <p>Todo lo que se hace en la tienda y en el panel, paso a paso y con los nombres exactos de los botones. Sirve para cualquier persona del equipo.</p>
    </div>
  </div>
</header>

<nav class="index" aria-label="Contenido">
  <div class="index-in">
    <a href="#entrar">Entrar y salir</a>
    <a href="#pedido">Un pedido en línea</a>
    <a href="#inventario">Inventario</a>
    <a href="#sobrepedido">Sobre pedido</a>
    <a href="#proveedor">Proveedor</a>
    <a href="#ventas">Ventas manuales</a>
    <a href="#consignacion">Consignación</a>
    <a href="#reportes">Reportes</a>
    <a href="#problemas">Si algo falla</a>
  </div>
</nav>

<div class="wrap">

<!-- ENTRAR -->
<section id="entrar">
  <div class="eyebrow">Lo primero</div>
  <h2>Entrar y salir</h2>
  <p class="lead">La tienda y el panel son la misma página. Al entrar con la contraseña se activan los botones de edición; los clientes nunca los ven.</p>
  <ol class="steps">
    <li><h3>Pulsa Ingresar</h3><p>Arriba a la derecha de cualquier página: <span class="b line">Ingresar</span></p></li>
    <li><h3>Escribe la contraseña del panel</h3><p>Es la contraseña del personal. Si la escribes mal, la página lo avisa y no entra.</p></li>
    <li><h3>Listo, estás en modo edición</h3><p>Sale una franja amarilla que dice <span class="tag">Modo edición activo</span> y aparecen los botones <span class="b">Panel</span> y <span class="b">Salir</span>.</p></li>
  </ol>
  <div class="rule warn">
    <strong>Al terminar, pulsa Salir</strong>
    <ul><li>Sin sesión, los botones de edición desaparecen y la página queda como la ve cualquier cliente.</li><li>No compartas la contraseña. Si la comparten por error, se puede cambiar.</li></ul>
  </div>
  <div class="mapa" aria-label="Partes del panel">
    <span><b>Pendientes de entrega</b> pedidos nuevos</span>
    <span><b>Pedidos a proveedor</b> lo que hay que pedir</span>
    <span><b>Inventario actual</b> piezas y valor</span>
    <span><b>Historial</b> ventas, consignación, reservas</span>
    <span><b>Reportes</b> gráficas</span>
    <span><b>Nuevo producto</b></span>
  </div>
</section>

<!-- PEDIDO EN LINEA -->
<section id="pedido">
  <div class="eyebrow">El flujo principal</div>
  <h2>Un pedido en línea, de principio a fin</h2>
  <p class="lead">El cliente elige y envía su pedido por WhatsApp. Tú lo revisas en el panel, fijas descuento, envío y fecha, y le confirmas el valor final.</p>

  <div class="two">
    <div class="lane">
      <h3>Lo que hace el cliente</h3>
      <ol class="steps">
        <li><h3>Elige sus piezas</h3><p>En Catálogo, Destacados o las categorías del menú. La lupa agranda la foto. Pulsa <span class="b gold">Agregar</span>. Si dice <span class="tag">Sobre pedido</span>, usa <span class="b line">Pídelo sobre pedido</span>.</p></li>
        <li><h3>Revisa su carrito</h3><p>Abajo ve "Te puede interesar" por si quiere agregar algo más. Llena nombre, correo, WhatsApp y si recoge o quiere envío local.</p></li>
        <li><h3>Envía el pedido</h3><p>Pulsa <span class="b">Enviar pedido a {{CORTO}}</span>. Aparece "Pedido recibido".</p></li>
        <li><h3>Manda el WhatsApp</h3><p>Pulsa el botón verde <span class="b green">Enviar mi pedido a {{CORTO}} por WhatsApp</span>. Sin este paso, {{CORTO}} no se entera aunque el pedido quede guardado.</p></li>
      </ol>
    </div>
    <div class="lane tienda">
      <h3>Lo que haces tú</h3>
      <ol class="steps">
        <li><h3>Recibes el WhatsApp y abres el panel</h3><p><span class="b line">Ingresar</span> y <span class="b">Panel</span>, pestaña <strong>Pendientes de entrega</strong>. Los nuevos traen la etiqueta <span class="tag red">POR VALIDAR</span>.</p></li>
        <li><h3>Valida el pedido</h3><p>En el recuadro rosa pon el descuento ($ o %), el costo de <strong>Envío local</strong> y la <strong>Fecha de entrega</strong>. Pulsa <span class="b">Validar y fijar valor neto</span>.</p></li>
        <li><h3>Confirma al cliente</h3><p>Pulsa <span class="b green">Enviar confirmación por WhatsApp</span>. Va el valor neto, la reserva, la fecha y la CLABE para pagar.</p></li>
        <li><h3>Registra su pago</h3><p>Cuando llegue el comprobante pulsa <span class="b">Confirmar pago de reserva</span>. Desde ese momento corre el plazo.</p></li>
        <li><h3>Entrega y cobra el resto</h3><p>Pulsa <span class="b green">Cobrar saldo y entregar</span>. El pedido pasa a Historial como venta cerrada.</p></li>
      </ol>
    </div>
  </div>

  <div class="rule">
    <strong>Reglas que conviene recordar</strong>
    <ul>
      <li>La reserva es el <strong>30%</strong> del total, o el cliente puede pagar todo.</li>
      <li>Una pieza apartada se guarda <strong>15 días</strong> desde que confirmas el pago. Si no la recogen ni la pagan, el sistema la cancela sola y regresa al inventario.</li>
      <li>Si el cliente no paga la reserva en <strong>2 días</strong>, la pieza se libera para otros.</li>
      <li>El cliente puede escribir un código o pedir descuento en el carrito. El descuento solo lo aplicas tú, al validar.</li>
      <li>Si algo no procede, usa <span class="b red">Cancelar</span> (regresa las piezas al inventario) o <span class="b red">Borrar</span> (desaparece del historial).</li>
    </ul>
  </div>
</section>

<!-- INVENTARIO -->
<section id="inventario">
  <div class="eyebrow">Día a día</div>
  <h2>Inventario, destacados y productos ocultos</h2>
  <p class="lead">Con tu sesión iniciada, cada producto del catálogo trae sus propios controles. Los cambios se guardan al instante.</p>
  <div class="cards">
    <div class="card">
      <h3><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>Existencias</h3>
      <p>Debajo de cada producto, la fila <strong>Existencia</strong> tiene <span class="b line">−</span> un número y <span class="b line">+</span>. También puedes escribir la cantidad y salir del campo.</p>
      <p>Lo mismo se hace en el panel, pestaña <strong>Inventario actual</strong>, que además muestra costo y valor de lo que tienes.</p>
    </div>
    <div class="card">
      <h3><svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>Destacados</h3>
      <p>La estrella de la esquina de la foto marca o quita un destacado. Los destacados salen en la portada (los primeros 20) y en la página <strong>★ Destacados</strong>.</p>
    </div>
    <div class="card">
      <h3><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19.5C5.5 19.5 1.5 12 1.5 12a19.6 19.6 0 0 1 4.6-5.7M9.9 4.7A10 10 0 0 1 12 4.5C18.5 4.5 22.5 12 22.5 12a19.5 19.5 0 0 1-2.7 3.7M1 1l22 22"/></svg>Ocultar y borrar</h3>
      <p>El ojo tachado oculta el producto: los clientes dejan de verlo, pero sigue guardado. Tú lo ves atenuado con la etiqueta <span class="tag">OCULTO</span>.</p>
      <ul>
        <li><span class="b green">Mostrar en la tienda</span> lo regresa.</li>
        <li><span class="b red">Borrar definitivamente</span> solo aparece en los ocultos y no se puede deshacer.</li>
        <li>"Ver solo los ocultos" filtra la lista.</li>
      </ul>
    </div>
    <div class="card">
      <h3><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Producto nuevo</h3>
      <p>Panel, pestaña <strong>Nuevo producto</strong>: nombre, código, precio, categoría y existencia inicial. La foto debe llamarse como el código, por ejemplo <code>12345.jpg</code>, y se sube con el resto del sitio.</p>
    </div>
  </div>
</section>

<!-- SOBRE PEDIDO -->
<section id="sobrepedido">
  <div class="eyebrow">Cuando no hay existencia</div>
  <h2>Productos sobre pedido</h2>
  <p class="lead">Un producto sin piezas no se pierde: el cliente puede pedirlo. Al pulsar <span class="b line">Pídelo sobre pedido</span> elige cómo quiere recibirlo.</p>
  <div class="versus">
    <div class="opt a">
      <span class="tag ok">Opción normal</span>
      <div class="big">~30 días</div>
      <p><strong>Espera al siguiente pedido normal.</strong></p>
      <ul><li>Sin costo de envío.</li><li>El plazo cuenta desde que confirmas el pago de la reserva.</li></ul>
    </div>
    <div class="opt u">
      <span class="tag red">Opción urgente</span>
      <div class="big">Máx. 15 días</div>
      <p><strong>Se pide aparte y con envío.</strong> El cliente elige el servicio:</p>
      <ul>
        <li>Guía prepagada (plataformas como EnviaYa): $110 a $160, 2 a 4 días hábiles</li>
        <li>Terrestre estándar: $180 a $250, 2 a 3 días hábiles</li>
        <li>Express, siguiente día: $280 a $350, 1 día hábil</li>
      </ul>
    </div>
  </div>
  <div class="rule">
    <strong>Tu parte</strong>
    <ul><li>Los rangos son una guía. Al validar el pedido fijas el costo exacto en <strong>Envío local ($)</strong>, antes de que el cliente pague.</li><li>En el panel los urgentes llevan la etiqueta roja <span class="tag red">URGENTE</span> con el servicio elegido.</li></ul>
  </div>
</section>

<!-- PROVEEDOR -->
<section id="proveedor">
  <div class="eyebrow">Reposición</div>
  <h2>Pedidos al proveedor y recepción</h2>
  <p class="lead">Aquí se junta todo lo que hay que pedir y se registra lo que llega. Al recibir, el inventario se actualiza solo.</p>
  <ol class="steps">
    <li><h3>Se llena la lista sola</h3><p>Cada encargo con reserva pagada aparece en <strong>Pedidos a proveedor</strong>. Tiene dos listas: <span class="tag ok">Siguiente pedido normal</span> y <span class="tag red">Urgentes, pedir ya</span>.</p></li>
    <li><h3>Ajusta las líneas</h3><p>Cada línea tiene su cantidad con <span class="b line">Guardar</span> y <span class="b red">Quitar</span>. Para reponer inventario sin que lo pida un cliente, usa "Agregar pieza para reponer inventario".</p></li>
    <li><h3>Mándalo al proveedor</h3><p>Pulsa <span class="b">Descargar PDF para enviar</span>: sale con logo, foto, código y cantidad. También puedes <span class="b line">Copiar lista</span>.</p></li>
    <li><h3>Marca que ya lo pediste</h3><p><span class="b green">Ya hice el pedido al proveedor</span> (o <span class="b green">Ya hice el pedido urgente</span>). Pasa a "Pedidos al proveedor en camino".</p></li>
    <li><h3>Cuando llegue, cotéjalo</h3><p>Pulsa <span class="b green">Ya llegó: cotejar y recibir</span>. Se abre una ventana con lo pedido y un campo para lo que realmente llegó. Pulsa <span class="b green">Confirmar</span> en cada línea.</p><p>Lo que corresponde a clientes se aparta para ellos y el resto entra al inventario. Si llegó menos de lo pedido, lo que falta vuelve a la lista por pedir.</p></li>
  </ol>
</section>

<!-- VENTAS MANUALES -->
<section id="ventas">
  <div class="eyebrow">Fuera de la página</div>
  <h2>Registrar ventas manuales</h2>
  <p class="lead">Para lo que vendes en persona, por mensaje o en redes. Descuenta del inventario y cuenta en los reportes. Los pedidos de la página aparecen en el mismo registro, marcados como "Página".</p>
  <ol class="steps">
    <li><h3>Abre el registro</h3><p>Panel, <strong>Historial</strong>, <strong>Registro de ventas</strong>, y pulsa <span class="b green">+ Registrar venta manual</span>.</p></li>
    <li><h3>Captura la venta</h3><p>Fecha (puede ser de días anteriores), cliente y teléfono (opcionales). Busca cada producto por código o nombre y elígelo. Ajusta cantidad y precio si hace falta. Pon descuento en $ o %.</p></li>
    <li><h3>Guarda</h3><p>Pulsa <span class="b green">Guardar venta</span>. Las piezas salen del inventario.</p></li>
  </ol>
  <div class="rule">
    <strong>Detalles útiles</strong>
    <ul>
      <li>Si el sistema marca menos piezas de las que vendiste, marca la casilla "Registrar aunque el sistema marque menos existencia" y el inventario queda en 0.</li>
      <li>Una venta manual equivocada se corrige con <span class="b line">Anular</span>: regresa las piezas al inventario.</li>
      <li>Para ver solo una parte, usa los filtros de origen, estado y fechas. <span class="b line">Descargar CSV</span> lo abre en Excel.</li>
      <li>En el carrito, con tu sesión, también puedes marcar <strong>Venta en mostrador</strong> para cobrar y entregar al momento; ahí el correo y el teléfono son opcionales.</li>
    </ul>
  </div>
</section>

<!-- CONSIGNACION -->
<section id="consignacion">
  <div class="eyebrow">Piezas fuera, sin cobrar</div>
  <h2>Consignación</h2>
  <p class="lead">Cuando dejas piezas con otra persona para que las venda. Salen del inventario, pero no cuentan como venta hasta que se liquidan.</p>
  <ol class="steps">
    <li><h3>Regístrala</h3><p>En <strong>Registro de ventas</strong>, abre <span class="b green">+ Registrar venta manual</span> y elige <span class="b line">Consignación (sin cobrar)</span>. Pon quién las tiene, su teléfono y los productos. Pulsa <span class="b green">Guardar consignación</span>.</p></li>
    <li><h3>Consulta quién tiene qué</h3><p>Pestaña <strong>Consignación</strong> del Historial: cuántas piezas hay fuera, cuánto está por cobrar y la lista de personas con su teléfono.</p></li>
    <li><h3>Liquida cuando te avisen</h3><p>En la consignación pulsa <span class="b green">Registrar venta o devolución</span>. Captura, por producto, cuántas se vendieron y cuántas regresan. Hay atajos <span class="b line">Todo vendido</span> y <span class="b line">Todo devuelto</span>.</p><p>Lo vendido se cobra y pasa a ventas. Lo devuelto regresa al inventario. Lo que no captures sigue en consignación, así que puedes liquidar en partes.</p></li>
  </ol>
  <div class="rule">
    <strong>Dónde se ve el resultado</strong>
    <ul><li>La pestaña Consignación y la sección "Consignación (hoy)" de <strong>Reportes</strong> muestran lo que está en consignación, lo ya vendido y lo devuelto.</li><li><span class="b red">Anular consignación</span> regresa al inventario lo que sigue pendiente.</li></ul>
  </div>
</section>

<!-- REPORTES -->
<section id="reportes">
  <div class="eyebrow">Para decidir</div>
  <h2>Reportes</h2>
  <p class="lead">Panel, pestaña <strong>Reportes</strong>. Arriba eliges el periodo (Hoy, 7 días, 30 días, Este mes, Todo) y el origen de las ventas.</p>
  <div class="cards">
    <div class="card"><h3>Ventas del periodo</h3><p>Ingresos, ganancia, costo, piezas vendidas, descuentos y cobrado. Gráficas de piezas y dinero por día, de unidades por categoría y los 10 productos más vendidos.</p><p>El costo se calcula como el 50% del precio de venta.</p></div>
    <div class="card"><h3>Por cobrar y reservas</h3><p>Cuentas por cobrar con la lista de quién debe, anticipos recibidos, apartados y encargos abiertos.</p></div>
    <div class="card"><h3>Consignación</h3><p>Piezas fuera, lo vendido, lo devuelto y quién tiene piezas.</p></div>
    <div class="card"><h3>Inventario y cancelaciones</h3><p>Piezas, valor a costo y a precio de venta, agotados. Cancelaciones por tipo y el dinero que hay que devolver.</p></div>
  </div>
</section>

<!-- PROBLEMAS -->
<section id="problemas">
  <div class="eyebrow">Soluciones rápidas</div>
  <h2>Si algo no se ve o no responde</h2>
  <div class="tabla">
    <table>
      <thead><tr><th>Qué pasa</th><th>Qué hacer</th></tr></thead>
      <tbody>
        <tr><td>No veo un cambio reciente en la página.</td><td>Haz una recarga forzada: Cmd+Shift+R en computadora. En el celular, cierra la pestaña y vuelve a abrir la tienda.</td></tr>
        <tr><td>El cliente dice que envió el pedido y no me llegó el WhatsApp.</td><td>Revisa Pendientes de entrega: si el pedido está ahí, quedó guardado. Falta que el cliente pulse el botón verde de WhatsApp.</td></tr>
        <tr><td>No me deja agregar un producto al carrito.</td><td>Ya tiene todas sus piezas en el carrito, o no hay más existencia. Si no hay, ofrece "Pídelo sobre pedido".</td></tr>
        <tr><td>Un producto no aparece en la tienda.</td><td>Puede estar oculto. Entra con tu sesión y usa "Ver solo los ocultos".</td></tr>
        <tr><td>Sale el aviso "Falta ejecutar el SQL".</td><td>Es una actualización que aún no se instala en la base de datos. Avisa a quien administra el sistema.</td></tr>
        <tr><td>Registré algo por error.</td><td>Ventas manuales: Anular. Pedidos de la página: Cancelar o Borrar. Consignación: Anular consignación. Inventario: ajusta con + y −.</td></tr>
      </tbody>
    </table>
  </div>
</section>

<footer>
  Esta guía describe la tienda tal como funciona hoy. Si se agregan funciones nuevas, se actualiza.
</footer>
</div>
`
