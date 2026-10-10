---
description: 
---

# Workflow Automatizado: Stage 02 - Catálogo de Productos y Compras

## ROL 1: [Orquestador]
1. Lee `.antigravity/stages/stage-02-inventory.md` y `.antigravity/RULES.md`.
2. Diseña los contratos de API/Servicios para: ABM de Productos, ABM de Presentaciones y Registro de Compras (Entrada de Mercadería).
3. DELEGA AUTOMÁTICAMENTE al [Backend].

## ROL 2: [Backend]
1. Escribe los servicios en TypeScript (`src/services/productService.ts`, `src/services/purchases.ts` y `src/services/supplierService.ts`).
2. Implementa la función de ingreso de compras que incrementa automáticamente el stock: `Bolsas * Peso_Bolsa = Kg_Totales` actualizando el costo.
3. Envía el código al [Reviewer].

## ROL 3: [Reviewer]
1. Revisa que las operaciones de stock e incremento de kilos utilicen precisión matemática exacta (sin `parseFloat` con pérdida de decimales).
2. Si aprueba, pasa al [Frontend].

## ROL 4: [Frontend]
1. Construye las pantallas de React con Tailwind CSS v4 para:
   - Formulario de Carga de Productos y Presentaciones.
   - Formulario de Registro de Compras a Proveedores.
2. Lee `.agents/skills/frontend-design/SKILL.md` para aplicar el sistema visual PetStock.
3. Cuando la interfaz esté implementada, pasa al [Tester].

## ROL 5: [Tester]
1. Crea o actualiza las pruebas Playwright de catálogo y compras:
   - `tests/products-categories.spec.ts`
   - `tests/purchases-suppliers.spec.ts`
   - `tests/tests/inventory.spec.ts` para la integración de stock y Supabase.
2. Ejecuta las pruebas después de implementar la interfaz:
   `npx playwright test tests/products-categories.spec.ts tests/purchases-suppliers.spec.ts tests/tests/inventory.spec.ts`
3. Valida que al ingresar 10 bolsas de 20 kg, el stock visual y en base de datos incremente exactamente en 200,000 kg sin errores de redondeo.
