# Stage 07 — Stock mínimo configurable por presentación

## Propósito

Permitir que el comerciante decida cuándo reponer cada presentación y mostrar una
alerta operativa coherente en Home, Catálogo e Inventario sin alterar existencias,
Kardex, costos ni rentabilidad.

## Alcance

- Configurar el mínimo al crear el producto y su presentación inicial.
- Configurar el mínimo al crear una presentación adicional.
- Editar el mínimo de una presentación activa desde el detalle del producto.
- Persistir un mínimo independiente por presentación en Supabase.
- Admitir cero y hasta tres decimales para productos por peso.
- Exigir valores enteros para productos vendidos por unidad.
- Alertar cuando `stock <= min_stock`, usando la misma unidad que la presentación.
- Mostrar producto, presentación, stock actual, mínimo y estado agotado cuando el
  stock sea cero.
- Excluir presentaciones archivadas de alertas y ofrecer acceso a su producto desde
  Home.
- Refrescar alertas después de editar el mínimo o registrar una operación confirmada,
  sin requerir una nueva sesión.

## Reglas funcionales

1. `min_stock` pertenece a `product_presentations`, no al total del producto.
2. Su valor inicial predeterminado es cero.
3. No existe un piso preventivo de cinco ni otra sustitución implícita.
4. Con mínimo cero, sólo se alerta cuando el stock es exactamente cero.
5. Un producto por unidad admite mínimos `0, 1, 2, ...`; uno por peso admite valores
   no negativos con hasta tres decimales.
6. Una presentación inactiva nunca aparece como alerta operativa.
7. Las operaciones comerciales continúan modificando exclusivamente `stock`; la
   configuración del mínimo no genera movimientos.

## Fuera de alcance

- Pronósticos de demanda, mínimos sugeridos y órdenes automáticas de compra.
- Mínimos por proveedor, sucursal o temporada.
- Notificaciones externas.
- Modificar o aplicar migraciones sobre Supabase real durante esta etapa.

## Criterios de aceptación

1. Crear y editar presentaciones conserva exactamente el mínimo ingresado, incluido
   cero y valores menores que cinco.
2. Múltiples presentaciones del mismo producto pueden tener mínimos diferentes.
3. Home, Catálogo e Inventario usan `stock <= min_stock` y distinguen agotado.
4. Una compra que deja `stock > min_stock` elimina la alerta tras refrescar datos.
5. Ventas, ajustes y mermas muestran la alerta al cruzar el umbral sin modificarlo.
6. No cambian stock, Kardex, costo histórico ni rentabilidad por editar el mínimo.
7. Build, lint, SQL aislado y regresión E2E aprueban antes de solicitar despliegue.
