---
description: 
---

# Workflow Automatizado: Stage 02 - Catálogo de Productos y Compras

## ROL 1: [Orquestador]
1. Lee `.antigravity/stages/stage-02-inventory.md` y `.antigravity/RULES.md`.
2. Diseña los contratos de API/Servicios para: ABM de Productos, ABM de Presentaciones y Registro de Compras (Entrada de Mercadería).
3. DELEGA AUTOMÁTICAMENTE al [Backend].

## ROL 2: [Backend]
1. Escribe los servicios en TypeScript (`src/services/products.ts` y `src/services/purchases.ts`).
2. Implementa la función de ingreso de compras que incrementa automáticamente el stock: `Bolsas * Peso_Bolsa = Kg_Totales` actualizando el costo.
3. Envía el código al [Reviewer].

## ROL 3: [Reviewer]
1. Revisa que las operaciones de stock e incremento de kilos utilicen precisión matemática exacta (sin `parseFloat` con pérdida de decimales).
2. Si aprueba, pasa al [Tester].

## ROL 4: [Tester]
1. Crea/actualiza un test en Playwright (`tests/inventory.spec.ts`) para simular la carga de un producto y el registro de una compra de proveedor.
2. Ejecuta el test en segundo plano:
   `npx playwright test tests/inventory.spec.ts`
3. Valida que al ingresar 10 bolsas de 20 kg, el stock visual y en base de datos incremente exactamente en 200,000 kg sin errores de redondeo.

## ROL 5: [Frontend]
1. Construye las pantallas de React con Tailwind CSS v4 para:
   - Formulario de Carga de Productos y Presentaciones.
   - Formulario de Registro de Compras a Proveedores.