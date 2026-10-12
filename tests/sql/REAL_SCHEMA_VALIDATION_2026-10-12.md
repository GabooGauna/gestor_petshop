# Validación 020–021 contra el esquema real de Supabase

Fecha: 2026-10-12

## Veredicto

La ruta de actualización **020 → 021 fue validada y aplicada en Supabase real** durante
una ventana de mantenimiento confirmada por el operador. Cada migración se ejecutó en
su propia operación transaccional y se verificó antes de continuar. Las postcondiciones
específicas y el gate final de sólo lectura aprobaron sin incidencias; PetStock puede
volver a operar normalmente.

No se necesita un baseline anterior a 018 para esta actualización. Producción ya tiene
018 y 019 registradas con cuerpos históricos anteriores; la ruta que debe probarse y
desplegarse parte del estado real actual. Reconstruir 017 mediante PITR o clone no
aportaría evidencia adicional para 020 → 021 y sí introduciría costo y manejo de datos
comerciales. No se solicitó ni ejecutó PITR, clone ni branch remoto.

## Acceso y artefacto de esquema

- El MCP de Supabase confirmó acceso real mediante una transacción `READ ONLY`.
- La conexión PostgreSQL temporal también se verificó con `transaction_read_only=on`,
  PostgreSQL `17.11` y acceso al esquema `public`.
- No se consultaron registros comerciales individuales. La auditoría remota usó
  catálogo, historial de migraciones y conteos/conciliaciones agregados.
- No había archivos versionados ni configuraciones locales del proyecto que contuvieran
  el host, usuario o contraseña anterior. No se modificaron URL, claves públicas ni
  variables ajenas a la contraseña PostgreSQL.
- La contraseña nunca se imprimió, copió al repositorio ni incorporó a una URL. El
  `PGPASSFILE` temporal indicado por el operador y su copia dentro del contenedor de
  exportación fueron eliminados al terminar.
- Se exportó `public` como `schema-only`, sin owner, mediante un archivo custom y se
  revisó su TOC antes de generar el SQL plano. El TOC no contiene `TABLE DATA`,
  `SEQUENCE SET` ni `BLOB`; el SQL no crea tablas `auth`/`storage` ni contiene patrones
  de secretos.
- Dump SQL temporal: `petstock-public-current-20261012.sql`, 86.433 bytes.
- SHA-256 del dump validado:
  `dd7a32ce244749c873434a57952c54ea8ab8c65936141257dfae87e1e45511f7`.
- Ese dump schema-only no es un backup de datos. El respaldo completo y durable se
  describe a continuación.

## Respaldo completo pre-020/021

Se creó un backup custom de PostgreSQL con estructura y datos exclusivamente de
`public`, mediante `pg_dump 17.11`, snapshot consistente
`--serializable-deferrable`, `--no-owner` y timeout de locks. No contiene datos de
`auth`, `storage`, `supabase_migrations`, usuarios ni secretos.

- Archivo:
  `C:\Users\gauna\AppData\Local\PetStock\Backups\pre-020-021-20261012\petstock-public-pre-020-021.dump`
- TOC:
  `C:\Users\gauna\AppData\Local\PetStock\Backups\pre-020-021-20261012\petstock-public-pre-020-021.toc`
- Tamaño del archive: 112.262 bytes.
- SHA-256:
  `01dbea8f8013de0a1b7b3277345ad8b430874cbcd67012a7644eba78e246174a`.
- TOC: nueve entradas `TABLE DATA`, exactamente para las nueve tablas PetStock, y
  ninguna entrada de datos para esquemas administrados.
- Protección: directorio y ambos archivos cifrados con EFS; propietario
  `Gabo\gauna`; ACL limitada a `Gabo\gauna` y `SYSTEM`.

La restauración se probó desde cero en la imagen Supabase/PostgreSQL
`17.11.0.004`. El hash dentro del contenedor coincidió con el archivo local; se
restauraron las nueve tablas, sus RLS, las funciones requeridas, constraints validados,
ACL de RPC y exactamente los mismos conteos agregados observados en remoto. Los valores
comerciales y sus conteos se mantuvieron únicamente en la evidencia operativa fuera de
Git.

Sobre esa restauración hubo cero diferencias de costos, totales de venta, totales de
compra, stock, Kardex o relaciones producto–presentación. Luego se aplicaron 020 y 021
exclusivamente en la copia; ambas postcondiciones y el gate postdespliegue aprobaron,
los conteos permanecieron idénticos y todos los ítems históricos anteriores conservaron
snapshots nulos. Los contenedores fueron eliminados y el `.pgpass` temporal, tanto en host como
en contenedor, fue eliminado y verificado como ausente.

El backup es recuperable en el equipo y perfil actuales. Como EFS depende del
certificado privado del usuario de Windows, antes de usarlo como única salvaguarda ante
pérdida total del equipo se debe exportar ese certificado con contraseña a una bóveda
independiente o copiar el archive a almacenamiento externo cifrado con gestión de
claves. No se debe mover una copia descifrada ni sincronizarla a un servicio no
autorizado.

## Estado remoto comprobado

- `public` contiene las nueve tablas esperadas y todas tienen RLS activo:
  `categories`, `suppliers`, `products`, `product_presentations`, `sales`,
  `sale_items`, `purchases`, `purchase_items` e `inventory_movements`.
- Historial remoto:
  - 018 `decimal_presentation_response`, versión `20261011070018`: aplicada.
  - 019 `logical_product_removal`, versión `20261011070019`: aplicada.
  - 020 `last_purchase_cost_snapshot`, versión `20261012154544`: aplicada.
  - 021 `reconcile_historical_transaction_hardening`, versión `20261012154611`: aplicada.
- SHA-256 de los cuerpos históricos guardados por Supabase:
  - 018 remota: `8e8ddf647efce2ef642805b57653da7c89ea17335716e991846099dc6f490723`.
  - 019 remota: `167e4f3883609a81370547a7012a1a7a7f0bfdd7f823664fe155ccb4ae13e7bb`.
- SHA-256 de los archivos locales aprobados:
  - 018: `c5ae2121eca773bc95c0bd5db3b17b82cb9b14f62bde40e20d759fdbb855e4ae`.
  - 019: `31aed561face8795e9d7016d8b3b90560b2490d61457547e7dc86edd85da8925`.
  - 020: `a9704c7ffe5348f13068f671a954d1fffe74612fc77e0dfb3e4edcc9b7e3a457`.
  - 021: `6db8ba5019b585b105fcb96d586b96202d6ff721f24f68d40a0818b40a14e776`.

Las revisiones históricas no se modifican ni se vuelven a ejecutar. La 018 remota ya
entrega el contrato decimal pero no contiene el advisory lock de su revisión local
final. La 019 remota ya implementa archivo lógico y policies de producto activo, pero
le faltan el advisory lock, la revalidación de producto activo en updates de
presentaciones y `REVOKE UPDATE(product_id)` para `authenticated`.

La nueva 021 reconcilia exactamente esos hardenings bajo una versión nueva. Reemplaza
de forma idempotente las definiciones finales de las funciones/policies afectadas,
instala el trigger faltante y restringe la reasignación directa de `product_id`; no
inserta ni repara filas del historial remoto correspondientes a 018/019.

La 020 agrega los snapshots de costo histórico y sus protecciones. El orden aprobado es
**020 primero, 021 después**. Ambas son compatibles en ese orden; 021 deja las
operaciones transaccionales con el locking final y no depende de inventar un estado
pre-018.

## Auditoría agregada previa

Sobre Supabase real, exclusivamente en lectura:

- costos vigentes divergentes: 0;
- totales de ventas descuadrados: 0;
- stocks negativos: 0;
- diferencias entre stock y Kardex: 0;
- sesiones esperando locks: 0;
- transacciones de más de un minuto: 0;
- existen renglones históricos de venta anteriores a 020; su conteo se conserva fuera
  de Git.

Esos renglones anteriores a 020 conservarán snapshots nulos por diseño. La
migración no reconstruye costo histórico a partir del costo actual, porque hacerlo
falsearía la rentabilidad histórica. Los informes deben mantener el tratamiento
explícito de costo desconocido previsto por el contrato.

Los advisors de seguridad actuales devuelven dos clases de warning: nueve RPC
`SECURITY DEFINER` ejecutables por `authenticated`, que son intencionales para el
contrato transaccional de este comercio y cuyos grants/validaciones fueron probados; y
la protección de contraseñas filtradas de Supabase Auth desactivada. Esta última no
bloquea 020→021, pero sigue siendo un riesgo operativo pendiente que debe resolverse
antes de considerar cerrada la preparación general para producción.

## Despliegue real

Inmediatamente antes del DDL se confirmó que la aplicación y sus dispositivos estaban
cerrados. El preflight remoto se repitió en una transacción `READ ONLY`: devolvió
`status=ready`, los conteos agregados coincidieron exactamente con el backup verificado,
no había XID de escritura, esperas de lock ni transacciones largas, y todas las
conciliaciones de stock, Kardex, compras, ventas y último costo permanecían en cero.
Por no existir cambios desde el snapshot, no fue necesario generar otro respaldo.

Se recalcularon los hashes locales y coincidieron con los aprobados. Luego se aplicó
únicamente 020. Su hash almacenado por Supabase coincidió byte a byte, se detectaron las
tres columnas y los dos triggers esperados, los permisos fueron correctos y se preservó
la totalidad de las filas existentes. Sólo después de aprobar esas postcondiciones se
aplicó únicamente 021. Su hash remoto también coincidió y quedaron activos el trigger
de producto vigente, los advisory locks y la prohibición de reasignar `product_id` para
`authenticated`.

El gate postdespliegue se ejecutó en `READ ONLY` y devolvió `status=passed`. Los conteos
de las nueve tablas fueron idénticos a los del preflight y el backup; no hubo diferencias
de costo de reposición, totales de ventas o compras, stock negativo, stock contra Kardex,
estructura, permisos ni historial de migraciones. Las filas de venta anteriores a 020
mantuvieron sus snapshots nulos por diseño y no se generaron transacciones comerciales
de prueba en producción. Las migraciones históricas 018 y 019 no se modificaron ni se
reaplicaron.

La revisión posterior de advisors no mostró una regresión causada por 020/021. Persisten
los avisos ya conocidos de RPC transaccionales `SECURITY DEFINER` accesibles sólo como
parte del contrato autenticado, protección de contraseñas filtradas desactivada e índices
aún sin uso; ninguno bloquea la reapertura de este despliegue.

## Ensayo sobre la copia descartable

Se restauró el dump actual en PostgreSQL/Supabase `17.11.0.004`, enlazado sólo a
`127.0.0.1`, dentro del contenedor identificado
`petstock_db_current_upgrade_20261012`. La base se clonó desde la plantilla Supabase
para conservar `auth.uid()`, `anon`, `authenticated`, extensiones y ACL. El rol
`postgres` recibió privilegio de superusuario sólo dentro del contenedor efímero para
restaurar los `ALTER DEFAULT PRIVILEGES` presentes en el dump.

El runner `validate-current-remote-upgrade.ps1` verificó antes de restaurar:

1. nombre de base descartable, servidor loopback y `petstock.environment=e2e`;
2. ausencia de contraseñas en la cadena de conexión;
3. runtime Supabase y esquema de negocio vacío;
4. TOC estrictamente schema-only y ausencia de patrones de secretos;
5. fingerprint exacto del estado remoto anterior a 020, incluida la presencia de las
   revisiones antiguas de 018/019 y la ausencia de sus hardenings finales.

Después creó fixtures sintéticos representativos sobre el esquema real, aplicó 020 y
021 en transacciones separadas con `ON_ERROR_STOP`, ejecutó las postcondiciones dentro
de cada transacción y volvió a comprobar cada fixture.

Resultado: **PASS**.

## Pruebas y resultados

Pruebas SQL/transaccionales aprobadas:

- compras y actualización atómica del último costo;
- ventas en las cuatro modalidades (importe, peso, bolsa y unidad);
- precisión `NUMERIC` de dinero/peso y redondeos;
- snapshots de precio, costo unitario, costo total y rentabilidad histórica;
- stock insuficiente y rollback integral sin encabezados huérfanos;
- inventario, mermas, ajustes y conciliación de Kardex;
- productos archivados y protección de presentaciones;
- triggers inmutables de snapshots y restricciones de integridad;
- RLS, grants de RPC, ausencia de ejecución anónima y revocación de
  `authenticated.UPDATE(product_id)`;
- preservación exacta de categorías, proveedor, producto, presentación, compra,
  venta, ítems, stock y movimientos creados antes de migrar.

Carreras reales con conexiones simultáneas aprobadas:

- venta/venta sobre el mismo stock;
- compra/venta;
- dos ventas multipresentación en orden inverso, sin deadlock;
- archivo contra venta, compra, merma, ajuste y edición directa;
- alta de presentación contra archivo, tanto cuando gana el alta como cuando gana el
  archivo.

Regresión del repositorio:

- `npm run lint`: PASS;
- `npm run build`: PASS; sólo permanece el warning conocido de chunk grande;
- `npm run test:e2e:safe`: 75 PASS, 1 SKIP (login real deliberadamente omitido al
  ejecutar sin credenciales E2E); todas las pruebas usan backend simulado y no escriben
  en Supabase.

## Comparación con el baseline sintético

El baseline sintético había aprobado la cadena 001→020 y los mismos contratos
transaccionales/concurrentes. El ensayo real también aprueba el comportamiento final,
pero reveló tres diferencias operativas que el sintético no podía detectar:

1. producción ya había registrado 018 y 019 con cuerpos distintos;
2. faltaban hardenings posteriores de locking, trigger y permiso, por lo que fue
   necesaria 021 en vez de reaplicar o editar migraciones históricas;
3. el dump real incluye ACL/default privileges de Supabase y debe restaurarse en un
   runtime preprovisionado con privilegios suficientes.

No hubo diferencias finales en resultados de compras, ventas, precisión, inventario,
Kardex, rentabilidad, errores esperados o concurrencia después de 020→021.

## Runbook de despliegue controlado

### 1. Go/no-go previo (sólo lectura)

1. Aprobar por hash los archivos 020 y 021 indicados arriba.
2. Ejecutar `remote_readonly_audit_018_020.sql` y confirmar nuevamente: 018/019
   históricas presentes, 020/021 ausentes, fingerprints esperados, conciliaciones en
   cero, sin locks ni transacciones largas.
3. Confirmar que no existe una ventana de mantenimiento o migración concurrente.
4. Confirmar que el cliente desplegado tolera snapshots nulos en filas históricas.

Una divergencia detiene el despliegue; no se usa `migration repair` ni se edita el
historial para forzar coincidencia.

### 2. Backup verificable

1. El backup completo descrito arriba cumple el gate técnico: archive, TOC, SHA-256,
   cifrado, ACL y restauración aislada ya fueron verificados.
2. Inmediatamente antes de la ventana, confirmar que no hubo escrituras desde el
   snapshot. Si los conteos o el instante cambiaron, producir un backup nuevo con el
   mismo procedimiento después de detener escrituras y validar su restauración antes
   de migrar.
3. Conservar por separado el dump schema-only y los hashes de migraciones como
   evidencia, no como sustituto del backup con datos.
4. Para tolerar pérdida del equipo, respaldar el certificado EFS o depositar otra copia
   cifrada en una bóveda autorizada antes de considerar este archive la única copia de
   recuperación.

### 3. Aplicación

1. Publicar una pantalla de mantenimiento o retirar temporalmente la SPA, cerrar todas
   las pestañas/dispositivos del único comercio y detener servidores locales. La
   auditoría confirmó que no existen Edge Functions ni `pg_cron`; no se identificaron
   otros escritores.
2. Ejecutar `production_preflight_020_021.sql`. Debe devolver `status=ready`, cero
   transacciones con XID, locks o transacciones largas y los conteos acordados. Si
   cambió cualquier conteo respecto del backup, tomar y restaurar un backup nuevo.
3. Verificar de nuevo los hashes locales exactos de 020 y 021.
4. Mediante el MCP `apply_migration`, aplicar
   `last_purchase_cost_snapshot` con el contenido byte-a-byte de 020. El MCP mantiene
   DDL e historial en la misma operación transaccional.
5. Ejecutar `postconditions_020.sql` en una transacción `READ ONLY`. Ante cualquier
   fallo, no continuar.
6. Mediante `apply_migration`, aplicar
   `reconcile_historical_transaction_hardening` con el contenido byte-a-byte de 021.
7. Ejecutar `postconditions_021.sql` y luego
   `production_postdeploy_020_021.sql`, ambos en `READ ONLY`.
8. No ejecutar 018 ni 019 y no alterar sus filas históricas.

### 4. Verificación posterior

1. Confirmar las nuevas versiones, hashes/fingerprints, columnas, constraints,
   funciones, policies, grants y triggers.
2. Repetir conciliaciones agregadas de venta, stock/Kardex, costos y stock negativo.
3. No crear compras ni ventas de humo en producción. La prueba con datos reales ya se
   realizó sobre la restauración y las pruebas de interfaz usan backend simulado. La
   comprobación remota posterior será estructural y agregada exclusivamente de lectura.
4. Verificar reportes de rentabilidad por lectura y que las filas históricas sigan
   identificadas como costo desconocido.
5. Reabrir escrituras únicamente si todo está en verde.

### 5. Recuperación

- Si 020 o 021 falla antes de commit, PostgreSQL revierte esa migración completa. Se
  conserva el error, se mantienen escrituras pausadas y no se continúa.
- Si 020 confirma y 021 falla, 020 se deja intacta porque es aditiva y compatible, se
  mantienen escrituras pausadas y se corrige 021 bajo una versión nueva. Sólo se
  restaura si las comprobaciones detectan pérdida de integridad. No se improvisa DDL
  inverso.
- Si una postcondición falla después de ambos commits, se mantienen escrituras pausadas.
  La recuperación preferida es una migración forward correctiva cuando los datos están
  íntegros; ante corrupción o pérdida de integridad, restauración completa del backup
  verificado al punto anterior y nueva conciliación antes de reabrir.
- Toda recuperación debe preservar evidencia, historial y hashes; nunca se marcan
  migraciones como aplicadas sin haber ejecutado su DDL.
- El archive contiene `public`, no `supabase_migrations`. Una restauración completa
  posterior a commits exitosos requiere autorización destructiva separada: respaldar
  primero el estado fallido, restaurar `public` en aislamiento o en una ventana cerrada,
  comprobar fingerprints/conteos y reconciliar únicamente las filas exactas 020/021 del
  historial. La ruta preferida después de un commit sigue siendo una corrección forward.

## Estado de autorización

La autorización de despliegue fue consumida exclusivamente para 020 y 021. No queda
ninguna operación de base de datos pendiente para cerrar esta etapa y no se requiere
autorización adicional para reabrir la aplicación. Cualquier migración futura,
restauración destructiva o cambio ajeno a este alcance requerirá una autorización nueva.
