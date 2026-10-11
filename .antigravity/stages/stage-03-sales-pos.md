Propósito: Módulo central de cobro y punto de venta.

Secciones del PRD asociadas: 9, 10, 11, 12, 13, 25.

Alcance:

Venta por Importe: Cálculo automático Monto / Precio_Kg = Kg a descontar.

Venta por Cantidad: Cálculo Kg * Precio_Kg = Total.

Venta por Bolsa Cerrada / Unidad: Descuento directo de stock.

Cálculo de Rentabilidad: Determinación automática de **ganancia bruta
estimada** por ítem usando el último costo de compra vigente al confirmar la
venta. No representa ganancia neta porque no descuenta impuestos, comisiones,
gastos operativos ni otros costos indirectos.

Política de costo de reposición:

- `product_presentations.cost` representa el costo de la última compra de una
  presentación completa o unidad. Una compra confirmada lo reemplaza de forma
  atómica; no se recalcula por promedio ponderado.
- Antes de la primera compra, el costo informado al crear la presentación es el
  costo inicial de reposición. Luego no puede editarse desde el catálogo: cambia
  únicamente al confirmar una compra.
- Venta fraccionada por importe o peso:
  `costo_linea = round((ultimo_costo_compra / peso_presentacion) * kg_descontados, 2)`.
  Los kg usados son los definitivos, redondeados a tres decimales, que se
  descuentan del stock.
- Venta de bolsa completa o unidad:
  `costo_linea = round(cantidad_comercial * ultimo_costo_compra, 2)`.
- Cada `sale_items` conserva el costo monetario definitivo de la línea y snapshots
  del costo de reposición y del peso de presentación usados. Cambios posteriores
  de compras, costos o peso no modifican ventas anteriores.
- El servidor calcula con `NUMERIC`: cantidades/peso a tres decimales, dinero a
  dos decimales y un único redondeo monetario por línea. El total de la venta es
  la suma de los renglones monetarios ya redondeados.
