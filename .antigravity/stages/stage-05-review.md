# Stage 05 — Informe de Reviewer

Fecha de revisión original: 2026-10-10

Fecha de revisión final: 2026-10-11

Resultado original: **aprobado para Frontend**.

## Addendum — política de último costo (2026-10-11)

La aprobación anterior no cubre la nueva migración local
`202610110020_last_purchase_cost_snapshot.sql`. La auditoría posterior detectó que
el catálogo todavía podía modificar `product_presentations.cost` directamente y
que `sale_items.cost` conservaba el costo monetario final, pero no los operandos
que acreditan la política aplicada. Backend debe integrar la migración y adaptar
el servicio.

Resultado final posterior a Frontend y QA: **implementación aprobada y migración
lista para una aplicación controlada, pero aún no validada mediante ejecución SQL**.
La migración restringe el costo vigente, congela y protege los operandos de cada
renglón, y los reportes siguen leyendo exclusivamente el costo histórico.

No se ejecutó `npm run test:db:isolated`: el entorno no dispone de `psql`, Supabase
CLI ni Docker. Esta limitación impide afirmar que la migración SQL está aprobada en
ejecución. No se usó la base remota, no se aplicaron migraciones y no se modificaron
datos reales.

### Correcciones y comprobaciones de la segunda revisión

- El trigger de alta verifica también que `sale_items.product_id` corresponda a la
  presentación seleccionada.
- Un segundo trigger vuelve inmutables costo, precio, cantidades, modalidad y
  snapshots de cada renglón confirmado, incluso ante código privilegiado futuro.
- La prueba SQL cubre importe, peso, bolsa y unidad; costo inicial y última compra;
  cambio posterior de costo; lectura histórica de rentabilidad; semántica de
  ganancia bruta estimada; permisos e inmutabilidad.
- El mock E2E de POS incluye el nuevo contrato de respuesta.
- Frontend retiró la edición de costo y muestra el valor como **Costo de reposición
  vigente**, denominación válida tanto para el costo inicial como para la última
  compra confirmada.
- Dashboard, reportes y Excel usan **Ganancia bruta estimada** y **Costo histórico**;
  explican expresamente que la ganancia neta no está disponible.
- El POS identifica sus cálculos locales como vista previa y presenta el importe
  confirmado por `process_sale` como definitivo.
- `npm run build`, `npm run lint` y `git diff --check` pasan.
- QA ejecutó 24 pruebas focalizadas y la suite segura completa con Chrome local:
  **75 aprobadas y 1 omitida**, sin fallos.
- Tras el ajuste semántico final, Reviewer repitió `tests/catalog-editing.spec.ts`
  con Chrome local: **2 aprobadas**.

### Preflight obligatorio antes de aplicar la migración 020

1. Confirmar que las migraciones 001–019 están aplicadas y que la 020 todavía no
   figura en el historial remoto.
2. Ejecutar `npm run test:db:isolated` sobre una base local descartable creada desde
   cero con todas las migraciones. La aplicación remota no debe sustituir esta prueba.
3. Auditar en sólo lectura que cada `product_presentations.cost` con compras coincida
   con el `unit_cost` de su compra más reciente, ordenada por `purchases.created_at`
   e `id`. La migración no corrige discrepancias.
4. Reconciliar en sólo lectura `sales.total_amount` y `sales.total_cost` contra las
   sumas de `sale_items.subtotal` y `sale_items.cost`. Toda diferencia requiere una
   corrección de datos autorizada por separado.
5. Contabilizar filas históricas de `sale_items`: conservarán sus costos definitivos,
   pero los tres campos nuevos quedarán `null`; no deben inventarse snapshots.
6. Revisar bloqueos/transacciones largas y tomar un respaldo antes de la ventana de
   despliegue. Los `ALTER TABLE ... VALIDATE CONSTRAINT` recorren `sale_items`.
7. Aplicar primero la migración y después desplegar el cliente que exige los nuevos
   campos de respuesta. Los clientes anteriores toleran las claves JSON adicionales;
   el orden inverso puede registrar la venta y luego rechazar la respuesta en UI.
8. En staging, verificar grants (`anon` sin ejecución, `authenticated` sólo por RPC),
   triggers, las cuatro modalidades, concurrencia compra/venta y reportes antes de
   autorizar producción.

## Alcance revisado

- Migración `202610100008_stage_05_analytics_contract.sql` aplicada.
- Migración correctiva `202610100009_optimize_authenticated_rls.sql` aplicada.
- Migración local `202610110020_last_purchase_cost_snapshot.sql` revisada pero no
  aplicada a ningún entorno remoto.
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

- Los cinco RPC analíticos son `SECURITY INVOKER`, `STABLE`, fijan
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

## Contrato entregado a Frontend

Frontend implementó `DashboardView` y `ReportsView` usando `reportService` como fuente
de los importes definitivos. React sólo formatea los strings decimales entregados por
los RPC y conserva como estimaciones explícitas los cálculos previos al cobro del POS.

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
- La suite segura finalizó con 75 casos aprobados y 1 omitido; Build y ESLint pasan.
