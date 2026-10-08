---
description: 
---

# Workflow Automatizado: Stage 03 - Punto de Venta (POS) y Cobro Fraccionado

## ROL 1: [Orquestador]
1. Lee `.antigravity/stages/stage-03-sales-pos.md` y `.antigravity/RULES.md`.
2. Diseña las funciones atómicas para: Venta por Importe ($), Venta por Peso (kg), Venta de Bolsa/Unidad y el cálculo de Ganancia Bruta.
3. DELEGA AUTOMÁTICAMENTE al [Backend].

## ROL 2: [Backend]
1. Crea `src/services/sales.ts`.
2. Implementa las fórmulas:
   - Importe: `Monto_Cobrado / Precio_Kg = Kg_a_Descontar`.
   - Cantidad: `Cantidad_Kg * Precio_Kg = Subtotal`.
   - Ganancia: `Subtotal - (Kg_Vendidos * Costo_Kg)`.
3. Garantiza la atomicidad de la transacción (si la venta falla, no se descuenta el stock).
4. Pasa al [Reviewer].

## ROL 3: [Reviewer]
1. Audita la precisión decimal y asegura que no haya desbordamientos ni errores de redondeo.
2. Al verificar el cumplimiento de `.antigravity/RULES.md`, pasa al [Tester].

## ROL 4: [Tester]
1. Crea/actualiza un test en Playwright (`tests/pos-sale.spec.ts`) para simular la venta por importe ($3.000) y por peso (2.5 kg).
2. Ejecuta los tests en segundo plano: `npx playwright test tests/pos-sale.spec.ts`
3. Valida que el calculador en pantalla muestre exactamente los decimales requeridos (ej: 1,071 kg) y que el stock disminuya correctamente en la UI.

## ROL 5: [Frontend]
1. Lee `.antigravity/skills/frontend-design/SKILL.md` para aplicar el sistema visual PetStock.
2. Construye la pantalla de **Punto de Venta (POS)**:
   - Contenedor superior con selector de pestañas ("Por unidad", "Por cantidad (kg)", "Por importe", "Presentación completa").
   - Cuadro destacado con borde celeste/verde para la cantidad entregada calculada (`1,071 kg`).
   - Botón principal de cobro rápido en verde esmeralda (`bg-[#10B981]`).
   - Resumen del ticket al pie con el total en negrita destacada.