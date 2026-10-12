# Stage 06 — Baja lógica de presentaciones

## Propósito

Permitir archivar y reactivar presentaciones sin borrar stock ni evidencia histórica,
y cerrar toda vía de mutación operativa mientras la presentación esté inactiva.

Secciones del PRD asociadas: 5, 6, 7, 9–18, 21, 23 y 26.

## Alcance

- Cada `product_presentations` tiene estado propio `active | inactive`.
- Dar de baja una presentación conserva la fila, el stock, el último costo, las
  ventas, las compras y el Kardex. No genera un movimiento porque no cambia stock.
- Una presentación inactiva puede consultarse y reactivarse, pero no puede recibir
  ventas, compras, ajustes ni mermas.
- La reactivación conserva exactamente el stock y costo vigentes al archivarla.
- El catálogo permite distinguir, archivar y reactivar variantes. Los selectores
  operativos ofrecen sólo productos y presentaciones efectivamente activos.
- Los historiales de ventas, compras y movimientos conservan nombre y referencia de
  las presentaciones archivadas. Los reportes históricos no filtran por estado actual.
- Las alertas y totales de stock operativo excluyen presentaciones inactivas.
- Se preservan las cuatro modalidades de venta: importe, peso, bolsa y unidad.

## Reglas funcionales

1. Una presentación es operable sólo si su propio estado y el de su producto son
   `active`.
2. Archivar o reactivar no puede modificar stock, costo, precio, peso ni identidad.
3. No se exige stock cero para archivar: el saldo se conserva y queda inmovilizado.
4. No se crea un movimiento de inventario por un cambio de estado.
5. No se reutiliza ni se reemplaza la fila archivada para representar otra variante.
6. La baja de producto sigue dominando la operabilidad: una presentación activa bajo
   un producto inactivo continúa sin poder usarse.
7. Los errores de backend usan `INACTIVE_PRESENTATION` para una mutación operativa y
   códigos específicos para transiciones de estado repetidas.

## Fuera de alcance

- Eliminación física o purga de presentaciones.
- Transferencia de stock entre presentaciones.
- Auditoría de usuario/fecha del cambio de estado.
- Reactivación automática de productos al reactivar una presentación.
- Modificar costos históricos o reconstruir snapshots de ventas anteriores.

## Criterios de aceptación

1. Archivar y reactivar preserva la misma fila, stock y costo.
2. Venta, compra, ajuste y merma sobre una presentación archivada fallan de forma
   atómica sin cabeceras huérfanas, movimientos ni cambios de stock/costo.
3. Una carrera entre archivado y cualquier mutación se serializa por la fila de la
   presentación: la mutación ocurre completa antes del archivo o es rechazada completa.
4. Las cuatro modalidades de venta mantienen cálculos, redondeos y snapshots de 020.
5. Historiales y reportes históricos muestran el nombre real de la variante archivada.
6. Dashboard, POS, compras e inventario operativo no ofrecen ni alertan variantes
   archivadas.
7. SQL aislado, pruebas de concurrencia y E2E pasan antes de solicitar autorización
   para aplicar la migración real.

