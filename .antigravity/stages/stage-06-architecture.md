# Stage 06 — Arquitectura y contratos de baja lógica de presentaciones

Este documento prepara el traspaso Orquestador → Backend → Reviewer → Frontend →
Tester. Complementa, sin ampliar, `stage-06-presentation-lifecycle.md`.

## Estado de entrada

- Las migraciones 020 y 021 están aplicadas en Supabase real según confirmación del
  usuario. No se realiza ninguna consulta ni escritura contra ese entorno en esta etapa.
- `delete_presentation(uuid)` elimina físicamente una presentación sin transacciones;
  rechaza variantes con compras o ventas y no considera movimientos de apertura.
- `product_presentations` no tiene estado propio. Sólo `products.status` impide hoy
  operaciones mediante los RPC transaccionales y el hardening de 021.
- Los reportes históricos ya enlazan por identificador y no filtran por estado actual.
  El detalle de rentabilidad usa `left join`; el Kardex también preserva las etiquetas.

## Modelo

```text
products.status                 product_presentations.status
 active ─────────────────────── active    => operable
 active ─────────────────────── inactive  => sólo lectura/reactivación
 inactive ───────────────────── cualquiera => no operable
```

`product_presentations.status` es `text not null default 'active'` con check
`('active','inactive')`. Se prefiere el mismo vocabulario de `products` para evitar
otra abstracción en la primera versión.

No se agregan `archived_at` ni `archived_by`: no son necesarios para integridad y el
modelo actual no conserva actor para otras operaciones. Esa auditoría queda futura.

## Contratos RPC

### `archive_presentation(p_presentation_id uuid) -> jsonb`

Bloquea primero la presentación y luego el producto. Requiere autenticación, producto
activo y presentación activa. Sólo cambia `status`.

```ts
interface PresentationLifecycleResult {
  presentation_id: string;
  product_id: string;
  name: string;
  status: 'active' | 'inactive';
  archived: boolean;
  reactivated: boolean;
}
```

### `reactivate_presentation(p_presentation_id uuid) -> jsonb`

Usa el mismo orden de locks. Requiere producto activo y presentación inactiva. Sólo
cambia `status`; no altera stock, costo ni precios.

### Compatibilidad `delete_presentation(uuid)`

Se conserva la firma para que un frontend anterior no pueda borrar físicamente filas
durante un despliegue escalonado. Pasa a ser alias de archivado y devuelve el mismo
resultado con `deleted: false`.

## Errores estables

- `AUTHENTICATION_REQUIRED`
- `PRESENTATION_NOT_FOUND`
- `INACTIVE_PRODUCT`
- `PRESENTATION_ALREADY_INACTIVE`
- `PRESENTATION_ALREADY_ACTIVE`
- `INACTIVE_PRESENTATION` para venta, compra, ajuste, merma o edición de una variante
  archivada.

## Barrera de escritura y concurrencia

Todas las mutaciones actuales adquieren `FOR UPDATE` sobre presentaciones antes de
cambiar stock. La migración 022 agrega un trigger `BEFORE UPDATE` que, ejecutado una vez
obtenido el lock, rechaza cualquier cambio sobre una fila cuyo estado vigente sea
inactivo, salvo la transición pura `inactive -> active`. También exige que archivar sea
una transición pura `active -> inactive`.

Esto evita duplicar la regla en cada RPC y cubre simultáneamente:

- `process_sale` en importe, peso, bolsa y unidad;
- `process_purchase` y su actualización exclusiva de costo de reposición;
- `record_stock_adjustment`;
- `record_shrinkage`;
- ediciones directas autenticadas permitidas por catálogo.

El orden global sigue siendo `presentaciones ordenadas por id -> producto`. Una carrera
se linealiza así:

```text
mutación gana lock -> stock/Kardex completos -> archivado
archivado gana lock -> status=inactive -> trigger rechaza mutación -> rollback completo
```

No se toma advisory lock nuevo: la fila ya existente es una frontera suficiente y evita
introducir otro namespace. Los RPC multi-ítem conservan orden por UUID para prevenir
deadlocks.

## RLS y privilegios

- `SELECT` autenticado conserva activas e inactivas para administración e historial.
- El `UPDATE` directo sólo califica filas activas y sólo puede dejar estado activo.
- `authenticated` no recibe privilegio de columna sobre `status`; las transiciones
  pasan exclusivamente por RPC `SECURITY DEFINER`.
- `anon` y `public` no ejecutan los RPC.

## Lecturas operativas e históricas

| Superficie | Regla |
|---|---|
| POS, compras, ajustes, mermas | producto activo + presentación activa |
| Catálogo administrativo | muestra ambos estados |
| Inventario/valuación actual | sólo presentaciones activas |
| Alerta de stock bajo | sólo presentaciones activas |
| Ventas/compras históricas | no filtra por estado actual |
| Kardex/reporte de movimientos | no filtra por estado actual |
| Rentabilidad histórica | usa `sale_items.cost` y snapshots; no costo/estado actual |

## Migración pendiente

`202610120022_logical_presentation_lifecycle.sql` es local y queda pendiente de
autorización explícita. Debe probarse desde un clon/esquema aislado que ya contenga
020 y 021. No modifica datos salvo completar `status='active'` por default al agregar
la columna a filas existentes.

## Matriz mínima de verificación

| Caso | Resultado |
|---|---|
| Archivar con stock > 0 | conserva fila, stock, costo e historial |
| Repetir archivado/reactivación | error estable, sin cambios |
| Reactivar bajo producto inactivo | `INACTIVE_PRODUCT` |
| Venta en 4 modalidades inactiva | `INACTIVE_PRESENTATION`, sin venta/Kardex |
| Compra inactiva | sin compra, costo, stock ni Kardex |
| Ajuste/merma inactiva | sin stock ni Kardex |
| Archivado concurrente con cada mutación | sólo uno de dos órdenes completos |
| Historial tras archivar | conserva nombre e importes/costos originales |
| Stock bajo | omite variante inactiva |
| Anónimo | sin lectura ni ejecución nueva |

