# Stage 06 — Runbook de actualización real (migración 022)

La migración 022 no se aplica como parte de este documento. Toda operación remota de
escritura requiere autorización explícita posterior al cierre del ensayo restaurado.

## 1. Preflight de sólo lectura

1. Confirmar por MCP que 020 y 021 figuran aplicadas y 022 ausente.
2. Ejecutar `tests/sql/production_preflight_022.sql` en producción. Debe devolver
   `status=ready` y cero transacciones largas.
3. Confirmar cero diferencias de último costo, stock/Kardex, totales de ventas,
   stock negativo y relaciones huérfanas.
4. Confirmar que la columna `product_presentations.status`, las RPC de ciclo de vida
   y su trigger todavía no existen. Un estado parcial detiene el despliegue.

## 2. Respaldo

1. Pausar escrituras antes del snapshot definitivo.
2. Crear un archive custom de `public`, estructura y datos, con PostgreSQL 17.11,
   `--serializable-deferrable`, `--no-owner` y timeout de locks.
3. Guardarlo fuera de Git, limitar ACL, cifrarlo y registrar SHA-256.
4. Revisar el TOC: exactamente las nueve tablas PetStock con `TABLE DATA`; ningún
   dato de `auth`, `storage` ni secretos.
5. Restaurar el archive en una base Supabase 17.11 descartable y comparar conteos,
   sumas y conciliaciones antes de ensayar 022.

En el host actual, EFS y BitLocker no están disponibles. La alternativa validada es
DPAPI con alcance `CurrentUser` y entropía UTF-8
`PetStock migration 022 backup v1`. La copia cifrada se verifica con
`ProtectedData.Unprotect` y el SHA-256 del contenido recuperado antes de eliminar el
archive sin cifrar. La restauración sólo es posible bajo el mismo perfil de Windows;
no mover el archivo como único respaldo a otro equipo sin recifrarlo para ese destino.

## 3. Ensayo restaurado

1. Ejecutar el runner con `-Current022` sobre una base vacía cuyo nombre comience con
   `petstock_e2e_` o `petstock_test_` y `petstock.environment=e2e`.
2. El runner restaura el SQL completo fuera del repositorio, ejecuta el preflight,
   captura agregados, aplica sólo 022, verifica preservación y ejecuta contratos y
   carreras de venta, compra, ajuste y merma.
3. Ejecutar además build, lint y `npm run test:e2e:safe`.
4. Eliminar base, contenedor y credencial temporal después de guardar hashes y
   resultados.

## 4. Ventana real

1. Publicar mantenimiento, cerrar dispositivos y detener escritores.
2. Repetir preflight y comparar con el backup restaurado. Si cambió cualquier dato,
   generar y restaurar un backup nuevo antes de continuar.
3. Verificar el SHA-256 local de 022 aprobado durante el ensayo.
4. Aplicar únicamente `logical_presentation_lifecycle` mediante MCP
   `apply_migration`; no editar ni reaplicar migraciones históricas.
5. Ejecutar `postconditions_022.sql` y `production_postdeploy_022.sql` en lectura.
6. Desplegar el frontend Stage 06 sólo después del DDL: el cliente nuevo consulta
   `product_presentations.status`; el cliente anterior es tolerado por el alias de
   `delete_presentation` mientras dura la ventana.
7. Hacer smoke test autenticado de catálogo y lecturas. No crear ventas o compras de
   prueba en producción.

## 5. Recuperación

- Si `apply_migration` falla antes del commit, PostgreSQL revierte la operación. No
  continuar ni marcar la migración como aplicada.
- Si una postcondición falla con datos íntegros, mantener escrituras pausadas y
  preparar una migración forward nueva; no editar 022 ni improvisar DDL inverso.
- Si existe corrupción o pérdida de integridad, respaldar primero el estado fallido y
  restaurar el archive verificado durante una ventana cerrada. La restauración real es
  destructiva y requiere autorización separada.
- Reabrir la aplicación únicamente cuando estructura, permisos, stock/Kardex,
  rentabilidad histórica y conteos coincidan.
