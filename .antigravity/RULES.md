# Reglas Globales de Arquitectura y Código

1. **Precision Decimal:** Prohibido usar `FLOAT` o `DOUBLE` para representar dinero o peso. Utilizar tipos numéricos exactos (`NUMERIC` / `DECIMAL` / `BigInt`).
2. **TypeScript Estricto:** No se permite el uso del tipo `any`. Todos los modelos de la base de datos deben estar tipados.
3. **Operaciones Atómicas:** Si un registro de venta falla, la actualización de stock debe cancelarse (transacciones en Supabase).
4. **UX de Mostrador:** Las pantallas de cobro deben requerir la menor cantidad de clics posible.
5. **Costo de Reposición:** La rentabilidad estimada usa el último costo de compra de la presentación, no costo promedio ponderado. El costo inicial rige sólo hasta la primera compra y luego el costo vigente cambia exclusivamente al confirmar compras.
6. **Snapshot Histórico:** Cada renglón de venta conserva el costo monetario definitivo y los operandos de costo usados al confirmarse. Compras o cambios de catálogo posteriores nunca recalculan ventas históricas.
7. **Semántica de Rentabilidad:** `importe vendido - costo histórico vendido` es **ganancia bruta estimada**. No debe presentarse como ganancia neta mientras no se modelen impuestos, comisiones y gastos operativos.
