# Stage 07 — Runbook de producción (migración 023)

La migración 023 no se aplica como parte de este documento. La escritura remota y la
publicación del frontend requieren autorizaciones explícitas y separadas.

## Orden obligatorio

```text
pausar escritores → preflight → respaldo final → aplicar 023 → postcondiciones
→ smoke de sólo lectura → publicar frontend → reabrir escritores
```

El frontend Stage 07 consulta `product_presentations.min_stock` e invoca la firma de
ocho argumentos de `create_product_presentation`, por lo que no debe llegar a Vercel
antes del DDL. Después de 023, el frontend anterior sigue funcionando mediante el
wrapper RPC de siete argumentos y permite una actualización escalonada segura.

## 1. Pausa y preflight

1. Anunciar mantenimiento, cerrar sesiones operativas y detener todos los escritores:
   POS, compras, ajustes, mermas y edición de catálogo.
2. Ejecutar `tests/sql/production_preflight_023.sql` en modo lectura.
3. Confirmar simultáneamente:
   - 020, 021 y 022 presentes; 023 ausente;
   - `product_presentations.status` presente y `min_stock` todavía ausente;
   - RPC anterior de siete argumentos presente y nueva firma ausente;
   - cero mínimos heredados inválidos;
   - cero diferencias stock/Kardex y ventas/totales;
   - cero transacciones largas.
4. Si cualquier condición falla o aparece un estado parcial, detener el despliegue.

## 2. Respaldo final

1. Con los escritores todavía pausados, crear un nuevo archive custom de `public`
   mediante `scripts/db/prepare-pgpass-pre023.ps1` y
   `scripts/db/backup-public-pre023.ps1`.
2. La credencial debe ingresarse sólo en la ventana nativa con
   `Read-Host -AsSecureString`; el `.pgpass` permanece fuera de Git, con ACL sin
   herencia, y se elimina al terminar.
3. Exigir PostgreSQL 17.11, snapshot `--serializable-deferrable`, `--no-owner`,
   timeout de locks y exactamente las nueve tablas PetStock con `TABLE DATA`.
4. Verificar el round-trip DPAPI, registrar SHA-256 y conservar solamente
   `.dump.dpapi`, TOC y manifiesto.
5. Si el fingerprint o los conteos cambiaron respecto del ensayo, restaurar esta copia
   final en Docker y repetir el runner antes de aplicar 023.

## 3. Aplicación de 023

1. Verificar que el SHA-256 del archivo aprobado sea
   `258eaa7600ea46a4949f5479fa27081d8563a6cf18df627b00b66f04ad38abf2`.
2. Aplicar únicamente
   `supabase/migrations/202610150023_configurable_presentation_min_stock.sql` con
   nombre `configurable_presentation_min_stock` mediante Supabase MCP.
3. No editar ni reaplicar migraciones históricas.
4. La migración debe ejecutar en una única transacción. Si falla antes del commit,
   PostgreSQL revierte columna, datos, funciones y estado de triggers.

## 4. Verificaciones posteriores

Con las escrituras aún pausadas:

1. Confirmar que 023 aparece una sola vez en el historial.
2. Ejecutar `tests/sql/postconditions_023.sql` y
   `tests/sql/production_postdeploy_023.sql` exclusivamente en lectura.
3. Comparar con el fingerprint previo:
   - mismos conteos y hashes de categorías, proveedores, productos,
     presentaciones —excluyendo la nueva columna—, ventas, compras, ítems y Kardex;
   - mismas sumas de stock, costos, ventas, compras y movimientos;
   - cada `product_presentations.min_stock` igual al mínimo heredado de su producto;
   - mínimos enteros para unidad y hasta tres decimales para peso;
   - los tres triggers de presentación habilitados;
   - stock/Kardex y totales de venta conciliados.
4. Hacer un smoke autenticado de sólo lectura en catálogo, detalle, inventario,
   dashboard y reportes. No crear operaciones comerciales de prueba.

## 5. Frontend y reapertura

1. Sólo después de aprobar las postcondiciones, preparar commit y publicar `main`.
2. Confirmar que Vercel despliega exactamente ese commit.
3. Repetir smoke autenticado de sólo lectura y comprobar que no haya errores nuevos de
   consola o red.
4. Reabrir escritores únicamente después de validar Supabase y Vercel.

## Recuperación

- Si la migración falla, mantener la aplicación en mantenimiento y no desplegar el
  frontend. La transacción debe haber revertido automáticamente.
- Si falla una postcondición después del commit, conservar la pausa y preparar una
  migración forward; no editar 023 ni improvisar DDL inverso.
- Una restauración en producción es destructiva, exige autorización separada y debe
  usar el archive final verificado. El cifrado DPAPI `CurrentUser` sólo es recuperable
  bajo el mismo perfil de Windows, salvo que se recifre deliberadamente.
