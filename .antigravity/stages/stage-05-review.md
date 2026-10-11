# Stage 05 — Informe de Reviewer

Fecha de revisión: 2026-10-10

Resultado: **aprobado para Frontend**.

## Alcance revisado

- Migración `202610100008_stage_05_analytics_contract.sql` aplicada.
- Migración correctiva `202610100009_optimize_authenticated_rls.sql` aplicada.
- Tipos Supabase de `src/types/database.types.ts`.
- Contratos y validadores de `src/services/reportService.ts`.
- Advisors de seguridad y rendimiento de Supabase.

## Precisión y contratos

- Dashboard, rentabilidad y métodos de pago reconcilian exactamente contra
  `sales.total_amount`, `sales.total_cost` y los costos históricos de `sale_items`.
- Todos los cálculos monetarios se realizan con `NUMERIC` en PostgreSQL y llegan al
  cliente como strings decimales.
- La revisión original validó stock bajo agregado por producto. La corrección
  posterior `202610100017_low_stock_by_presentation.sql` lo evalúa por presentación,
  conserva la unidad del producto y aplica un umbral preventivo mínimo de 5 uds/kg.
- La serie anual validada contiene 365 días y rellena días sin ventas con cero.
- El corte `2026-10-10 00:30 UTC` se clasifica como `2026-10-09` en
  `America/Argentina/Buenos_Aires`.
- Rangos invertidos, rangos mayores a 366 días, tipos de movimiento inválidos y
  paginación inválida tienen códigos de error estables.

## Seguridad

- Los cuatro RPC analíticos son `SECURITY INVOKER`, `STABLE`, fijan
  `search_path = ''`, respetan RLS y no pueden ser ejecutados por `anon`.
- `authenticated` conserva el permiso mínimo de ejecución requerido.
- Los ocho avisos por RPC transaccionales `SECURITY DEFINER` existentes se aceptan:
  son el límite de escritura atómica sobre tablas sin escritura directa, fijan
  `search_path = ''` y no son ejecutables por `anon`. Los dos RPC de creación de
  catálogo evitan altas parciales de productos y presentaciones.
- La protección de contraseñas filtradas continúa desactivada en Supabase Auth. Es una
  configuración operativa recomendada, pero no bloquea el contrato analítico.

## Rendimiento

- La migración 008 cubre claves foráneas y filtros de fecha/tipo utilizados por los
  reportes; desapareció el advisor de foreign keys sin índice.
- La migración 009 cambia las 15 políticas a `(select auth.uid())`, conservando su
  semántica y eliminando el advisor `auth_rls_initplan`.
- Los nuevos índices aparecen como no utilizados porque fueron creados recientemente y
  las tablas actuales tienen muy pocas filas. No deben eliminarse antes de medir carga
  representativa.

## TypeScript

- No se introdujo `any`.
- Las respuestas `Json` se validan desde `unknown` antes de exponerse a la interfaz.
- Fechas, límites, offsets, métodos de pago, unidades y discriminantes se validan en el
  servicio.
- Build, ESLint y `git diff --check` finalizan correctamente.

## Riesgos aceptados y seguimiento

1. Activar leaked-password protection en Supabase Auth antes de producción.
2. Reevaluar uso de índices con volumen real, no con las tablas actuales.
3. Mantener la suite E2E segura como barrera de regresión antes de cada entrega.

## Handoff a Frontend

Frontend puede implementar `DashboardView` y `ReportsView` usando exclusivamente
`reportService`. No debe recalcular importes, costos, ganancias, márgenes ni variaciones
en React; sólo formatear los strings decimales entregados por los RPC.

## Verificación posterior a Frontend y limpieza

- Se eliminó `StockOverview`, ya reemplazado por el dashboard analítico.
- Reportes exporta libros Excel tipados para rentabilidad y movimientos; rentabilidad
  incorpora período seleccionado, fecha de venta, presentación y medio de pago en cada
  fila; la vista de métodos queda informativa.
- El alta inicial de producto, presentación y stock se ejecuta en una única transacción.
- Cada presentación adicional admite stock propio y registra su saldo inicial en Kardex
  mediante `create_product_presentation`.
- Kardex pagina los movimientos y conserva un conteo de respaldo cuando el proxy no
  expone `Content-Range`.
- La suite segura finalizó con 55 casos aprobados y 1 omitido; Build y ESLint pasan.
