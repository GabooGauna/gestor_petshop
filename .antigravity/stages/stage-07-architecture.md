# Stage 07 — Arquitectura y contratos de stock mínimo configurable

Este documento prepara el traspaso Orquestador → Backend → Reviewer → Frontend →
Tester y complementa `stage-07-configurable-min-stock.md`.

## Modelo de datos

`product_presentations.min_stock numeric(10,3) not null default 0` es la única fuente
operativa del umbral. La migración copia una vez `products.min_stock` a las
presentaciones existentes para conservar la configuración previa, sin elevar valores
menores que cinco. La columna histórica en `products` queda sólo para compatibilidad
durante el despliegue escalonado y no participa en alertas nuevas.

Un trigger de integridad rechaza negativos, más de tres decimales y mínimos
fraccionarios cuando `products.type = 'unit'`. La edición del mínimo es una actualización
de catálogo y no escribe en `inventory_movements`.

## Contratos RPC

### `create_product_with_presentation`

Conserva su firma. `p_min_stock` configura tanto la columna compatible del producto
como `min_stock` de la presentación inicial. La validación distingue unidad y peso.

### `create_product_presentation`

La firma vigente incorpora `p_min_stock numeric`. Para compatibilidad con clientes
anteriores se conserva un wrapper de siete parámetros que usa el mínimo histórico del
producto, o cero si no existe. Ninguna firma aplica el piso preventivo de cinco.

### `get_dashboard_analytics`

Devuelve `low_stock` sólo para productos y presentaciones activas que cumplen
`pp.stock <= pp.min_stock`. Cada fila incluye `min_stock`, stock y unidad de la
presentación; no mezcla saldos entre variantes.

## Escritura, RLS y ciclo de vida

- `authenticated` puede actualizar `min_stock` únicamente en presentaciones activas,
  bajo la política y el trigger de Stage 06.
- El trigger de ciclo de vida considera `min_stock` al verificar que archivar o
  reactivar sea una transición pura.
- `anon` y `public` no obtienen permisos nuevos.
- La migración no ejecuta compras, ventas, ajustes, mermas ni movimientos de apertura.

## Lectura compartida en la aplicación

Frontend usa una función común con la regla exacta:

```text
producto activo + presentación activa + stock <= min_stock => alerta
stock = 0 => agotado
```

La unidad visible deriva del tipo del producto: `uds` para unidad y `kg` para peso.
Dashboard prioriza el catálogo autenticado ya cargado y mantiene el RPC como respaldo,
lo que permite despliegues escalonados sin volver a iniciar sesión.

## Compatibilidad y migración

`202610150023_configurable_presentation_min_stock.sql` depende de 022 y queda local,
pendiente de autorización para aplicarse en Supabase real. El backfill sólo copia el
mínimo existente; no modifica `stock`, costos, precios, movimientos ni históricos.

## Matriz de verificación

| Caso | Resultado esperado |
|---|---|
| Mínimos 0, 1, 2, 3, 4, 5 y superiores | se conservan sin piso implícito |
| Unidad con decimal | error estable, sin cambios |
| Peso con hasta tres decimales | aceptado |
| Stock igual o menor al mínimo | alerta |
| Mínimo 0 y stock positivo | sin alerta |
| Mínimo 0 y stock 0 | agotado |
| Variantes del mismo producto | evaluación independiente |
| Presentación archivada | sin alerta operativa |
| Editar mínimo | sin movimiento de inventario |
| Compra deja stock sobre mínimo | alerta desaparece al refrescar |
| Venta/ajuste/merma cruza mínimo | alerta aparece al refrescar |
