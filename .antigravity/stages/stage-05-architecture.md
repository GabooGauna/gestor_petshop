# Stage 05 — Arquitectura y contratos de implementación

Este documento prepara el traspaso Orquestador → Backend → Reviewer → Frontend →
Tester. No reemplaza el alcance de `stage-05-analytics.md`.

## Estado de entrada

- Stages 1–4 están versionados y el commit actual declara Stage 4 finalizado.
- Build y ESLint pasan.
- El esquema remoto contiene las siete migraciones locales, RLS activo y datos de
  ventas, compras y movimientos.
- El inicio actual (`StockOverview`) y el botón Reportes se reemplazarán/conectarán en
  Frontend; no existe aún `reportService.ts`.
- Vite inicia correctamente y Playwright descubre los casos, pero tanto la suite segura
  como un archivo focalizado se bloquean antes de ejecutar tests, en el límite de
  `webServer`/lanzamiento del navegador de este entorno. Debe diagnosticarse antes del
  cierre del Stage 5; no es un fallo de assertions observado.

## Arquitectura de lectura

```text
Dashboard / Reportes
        |
        v
reportService.ts  -- valida respuestas unknown sin any
        |
        v
RPC SECURITY INVOKER (authenticated)
        |
        +-- sales + sale_items
        +-- purchases + suppliers
        +-- products + product_presentations
        `-- inventory_movements
```

La migración `202610100008_stage_05_analytics_contract.sql` agrega índices y cuatro
RPC de sólo lectura. Los RPC agregan en PostgreSQL con `NUMERIC` y serializan importes
y cantidades como strings.

La migración local
`202610110020_last_purchase_cost_snapshot.sql` completa el contrato transaccional:
impide editar el costo de reposición directamente, conserva en cada renglón nuevo
el costo de presentación y peso usados, y verifica que `sale_items.cost` coincida
con esos operandos. Debe aplicarse junto con la adaptación Backend; no se aplica
remotamente desde esta etapa.

Antes de cualquier aplicación remota debe ejecutarse una auditoría de sólo lectura
que compare `product_presentations.cost` con el `unit_cost` de su compra más
reciente. La migración no reescribe costos ni completa snapshots heredados. Toda
corrección de datos reales requiere autorización separada.

## Contrato de costo y rentabilidad

- Fuente vigente: `product_presentations.cost`, inicializada al crear la
  presentación y reemplazada exclusivamente por `process_purchase` al confirmar
  una compra. No hay promedio ponderado.
- Snapshot de venta: `sale_items.cost` es el costo monetario definitivo;
  `replacement_cost_snapshot`, `presentation_weight_snapshot` y `cost_basis`
  conservan los operandos y la política aplicados. En filas heredadas los nuevos
  campos pueden ser `null`; no se inventa una procedencia histórica. `cost_basis`
  distingue `opening_cost` (aún sin compras) de `last_purchase`.
- Fraccionados (`amount`, `weight`): costo calculado sobre los kg definitivos que
  salen del stock, usando costo de presentación dividido por peso de presentación.
- Completos (`package`, `unit`): costo calculado como cantidad comercial por costo
  de presentación/unidad.
- Redondeo: PostgreSQL `NUMERIC`, tres decimales para stock y dos para el costo
  monetario de cada línea; los totales suman líneas ya redondeadas.
- `gross_profit` siempre significa **ganancia bruta estimada**. Ganancia neta no
  forma parte del modelo actual y no debe inferirse ni etiquetarse como disponible.

## Contratos RPC

### `get_dashboard_analytics(p_from date, p_to date) -> jsonb`

```ts
interface DashboardAnalytics {
  timezone: 'America/Argentina/Buenos_Aires';
  period: { from: string; to: string };
  today: MetricSummary & { sales_change_pct: Decimal | null };
  selected_period: MetricSummary & {
    sales_change_pct: Decimal | null;
    profit_change_pct: Decimal | null;
  };
  daily_sales: Array<{
    date: string; sales_count: number; sales: Decimal; total_cost: Decimal;
    gross_profit: Decimal; margin_pct: Decimal | null;
  }>;
  low_stock: Array<{
    product_id: string; product_name: string; product_type: 'unit' | 'weight';
    presentation_id: string; presentation_name: string;
    current_stock: Decimal; min_stock: Decimal; unit: 'kg' | 'uds';
  }>;
  recent_sales: Array<{
    id: string; created_at: string; total_amount: Decimal; total_cost: Decimal;
    gross_profit: Decimal; payment_method: PaymentMethod;
  }>;
  recent_purchases: Array<{
    id: string; created_at: string; total_amount: Decimal;
    supplier_id: string | null; supplier_name: string | null;
  }>;
}

type Decimal = `${number}`;
interface MetricSummary {
  sales_count: number;
  total_amount: Decimal;
  total_cost: Decimal;
  gross_profit: Decimal;
  margin_pct: Decimal | null;
}
```

### `get_product_profitability_report(p_from date, p_to date) -> jsonb`

Array ordenado por ganancia descendente. Agrupa por producto y devuelve
`sales_count`, `stock_quantity`, `total_amount`, `total_cost`, `gross_profit` y
`margin_pct`. `stock_quantity` está en la unidad base del producto.

### `get_payment_method_report(p_from date, p_to date) -> jsonb`

Array con los seis métodos canónicos (`efectivo`, `transferencia`, `debito`,
`credito`, `mercado_pago`, `otro`), aun cuando el total sea cero. Devuelve cantidad,
importe y participación porcentual.

### `get_profitability_detail_report(p_from date, p_to date) -> jsonb`

Contrato exclusivo para la exportación Excel. Devuelve una fila por ítem vendido con la
fecha exacta de venta. El período seleccionado se incorpora desde los filtros de la
solicitud. Conserva importes, costos históricos y medio de pago sin recalcular totales en
el navegador; no intenta inferir lotes o fechas de compra que el modelo no registra.

### `get_inventory_movement_report(...) -> jsonb`

Acepta fechas, tipo opcional, producto opcional, límite 1–500 y offset no negativo.
Devuelve `{ total_count, items }`, con nombres de producto/presentación, unidad,
cantidad firmada, motivo, referencia y fecha.

La interfaz exporta Excel para rentabilidad y movimientos. Métodos de pago permanece
como vista informativa y no expone una descarga separada.

## Manejo de errores

- `INVALID_DATE_RANGE`: `p_from` posterior a `p_to`.
- `DATE_RANGE_TOO_LARGE`: más de 366 días inclusivos.
- `INVALID_MOVEMENT_TYPE`, `INVALID_LIMIT`, `INVALID_OFFSET` para paginación/filtros.
- El servicio traduce estos códigos a mensajes de interfaz; errores desconocidos
  conservan un mensaje genérico y permiten reintentar.

## Plan visual PetStock

Paleta existente: navegación `#0F172A`, fondo `#F8FAFC`, acción azul `#2563EB`,
confirmación esmeralda `#059669`, alertas ámbar/rojo y superficies blancas. Se mantiene
Poppins para evitar introducir una identidad paralela.

La decisión distintiva es una franja operativa superior: métricas alineadas sobre una
línea temporal compacta, seguida por un cuerpo asimétrico que da prioridad a las
alertas accionables de stock.

```text
Desktop
+---------------------------------------------------------------+
| Período                         [7 días] [30 días] [Personalizar]|
| Vendido hoy | Vendido período | Ganancia + margen             |
+--------------------------------------+------------------------+
| Ventas y ganancia por día            | Stock bajo             |
| gráfico de línea                     | lista + Ver detalle    |
+--------------------------------------+------------------------+
| Últimas ventas                       | Últimas compras        |
+---------------------------------------------------------------+

Móvil
+-------------------------+
| Período / filtros       |
| Métrica principal       |
| 2 métricas compactas    |
| Gráfico desplazable no  |
| Stock bajo              |
| Últimas operaciones     |
+-------------------------+
```

Se evita convertir cada dato en una tarjeta idéntica: la serie temporal es el elemento
memorable y el resto conserva jerarquía sobria. Foco visible, contraste AA, estados
vacíos instructivos y movimiento sólo al cambiar filtros.

## Secuencia de entrega

1. Backend aplica la migración 008, regenera tipos y crea `reportService.ts` con
   validadores de respuesta.
2. Reviewer valida límites temporales, precisión, RLS, planes de consulta y ausencia
   de `any`; ejecuta advisors después de la migración.
3. Frontend implementa `DashboardView` y `ReportsView`, conecta navegación y conserva
   `StockOverview` como bloque reutilizable o lo retira si queda duplicado.
4. Tester actualiza los mocks RPC, adapta `home-dashboard.spec.ts`, crea
   `dashboard.spec.ts` y ejecuta el módulo seguido por la suite completa.

## Matriz mínima de pruebas

| Caso | Resultado |
|---|---|
| Sin ventas | Totales `0.00`, margen/variación `null`, listas vacías |
| Venta hoy BA | Impacta hoy, serie, método y rentabilidad |
| Venta 00:30 UTC | Pertenece al día anterior en Buenos Aires |
| Costo histórico | Ganancia usa `sale_items.cost`, no costo actual |
| Compra posterior | Actualiza costo vigente pero no snapshots ni rentabilidad previa |
| Edición de catálogo | No puede modificar el último costo de compra |
| Venta fraccionada | Usa kg definitivos a 3 decimales y redondea costo una vez a 2 |
| Bolsa/unidad | Usa cantidad comercial por costo de reposición vigente |
| Etiquetas | Muestran "Ganancia bruta estimada"; nunca "ganancia neta" |
| Período anterior cero | Variación `null`, nunca infinito |
| Presentación igual al umbral | Aparece como stock bajo |
| Presentación agotada con otra variante disponible | La agotada permanece visible |
| Métodos sin ventas | Aparecen con importe `0.00` |
| Filtros inválidos | RPC rechaza con código estable |
| Anónimo | No puede ejecutar RPC ni leer tablas |
