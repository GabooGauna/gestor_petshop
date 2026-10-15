# Stage 05 — Dashboard y reportes

## Propósito

Entregar una lectura operativa y de rentabilidad basada únicamente en las operaciones
confirmadas por el backend. El usuario no debe realizar cálculos manuales.

Secciones del PRD asociadas: 14, 20, 21 y 23.

## Convenciones funcionales

- La zona horaria del negocio es `America/Argentina/Buenos_Aires`.
- Los filtros reciben fechas civiles inclusivas (`desde` y `hasta`).
- Dinero se calcula en PostgreSQL con `NUMERIC` y se expone como texto decimal con
  dos posiciones. Cantidades de stock se exponen con tres posiciones.
- `costo_historico_vendido` es la suma de `sale_items.cost`, congelado al confirmar
  cada venta con la política de último costo de compra. Nunca se reconstruye desde
  `product_presentations.cost`, compras posteriores ni el costo actual.
- `ganancia_bruta_estimada = importe_vendido - costo_historico_vendido`.
  Los contratos conservan la clave técnica `gross_profit`, pero toda etiqueta
  visible y exportación debe decir **Ganancia bruta estimada**.
- `margen_pct = ganancia_bruta / importe_vendido * 100`; es `null` cuando el importe
  vendido es cero.
- No se calcula ganancia neta. Si se la menciona en una ayuda o estado vacío, debe
  indicarse explícitamente que no está disponible porque esta etapa no registra
  impuestos, comisiones ni gastos operativos.
- Las variaciones comparan con el período inmediatamente anterior de igual cantidad
  de días; son `null` cuando el período anterior vale cero.
- Stock bajo se evalúa por presentación activa de cada producto activo, con la regla
  exacta `stock_presentacion <= minimo_presentacion`. Desde Stage 07 el umbral es el
  valor persistido para esa presentación, admite cero y no aplica pisos preventivos.
  Así una variante agotada no queda oculta por el stock de otra presentación.
- El dashboard deriva esta alerta del catálogo autenticado ya cargado por la aplicación
  y conserva `low_stock` del RPC como respaldo. Esto permite operar correctamente
  durante despliegues donde la interfaz y la migración SQL no se actualizan a la vez.

## Alcance

### Dashboard principal

- Total vendido hoy y variación contra ayer.
- Total vendido en el período seleccionado y variación contra el período anterior.
- Ganancia bruta del período, margen y variación contra el período anterior.
- Serie diaria de ventas y ganancia para el gráfico de línea.
- Productos con stock bajo, con acceso a Inventario/Productos.
- Cinco últimas ventas y cinco últimas compras.
- Atajos a Punto de venta, Compras e Inventario.

El período inicial del dashboard son los últimos 7 días, incluyendo hoy.

### Reportes

- Rentabilidad por producto y período: ventas, costo histórico, ganancia bruta estimada y
  margen. No se recalcula el costo usando el costo actual de la presentación.
- Ventas por método de pago y período, incluyendo métodos sin movimientos con cero.
- Movimientos globales filtrables por período, tipo y producto, paginados y ordenados
  del más reciente al más antiguo.
- Exportación Excel de rentabilidad —con período seleccionado, fecha de venta,
  presentación y medio de pago en el mismo detalle— y de movimientos. El reporte de
  métodos de pago queda como resumen informativo en pantalla.

### Estados obligatorios

- Carga, error recuperable y vacío para cada bloque de datos.
- Los filtros inválidos (`desde > hasta` o períodos mayores a 366 días) no consultan
  la base y muestran una indicación accionable.
- Desktop, tablet y móvil sin scroll horizontal en las tarjetas; las tablas pueden
  transformarse en lista compacta en móvil.

## Fuera de alcance

- Ganancia neta, impuestos, descuentos y promociones.
- Exportación a PDF y exportación Excel independiente de métodos de pago.
- Cierre o arqueo de caja.
- Tiempo real, materialized views y pronósticos.
- Comparaciones entre sucursales o usuarios.

## Criterios de aceptación

1. Todos los totales coinciden con `sales.total_amount`, `sales.total_cost` y
   `sale_items.cost` dentro del rango temporal del negocio.
2. Una venta realizada cerca de medianoche pertenece al día de Buenos Aires correcto.
3. Los reportes vacíos devuelven ceros/listas vacías, no errores ni `NaN`.
4. Los RPC sólo son ejecutables por `authenticated` y respetan RLS como
   `SECURITY INVOKER`.
5. Los filtros de fecha utilizan límites por `created_at`, aptos para índices.
6. Build, lint, el test E2E del módulo y la suite completa pasan después de implementar
   Backend, revisión e interfaz en el orden definido por `AGENTS.md`.
