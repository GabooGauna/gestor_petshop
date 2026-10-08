# Reglas Globales de Arquitectura y Código

1. **Precision Decimal:** Prohibido usar `FLOAT` o `DOUBLE` para representar dinero o peso. Utilizar tipos numéricos exactos (`NUMERIC` / `DECIMAL` / `BigInt`).
2. **TypeScript Estricto:** No se permite el uso del tipo `any`. Todos los modelos de la base de datos deben estar tipados.
3. **Operaciones Atómicas:** Si un registro de venta falla, la actualización de stock debe cancelarse (transacciones en Supabase).
4. **UX de Mostrador:** Las pantallas de cobro deben requerir la menor cantidad de clics posible.