# Contexto del Proyecto: Sistema de Gestión de Mascotas

## 1. Misión
Sistema web de gestión de inventario, ventas y rentabilidad diseñado para un negocio de alimentos y accesorios de mascotas. El sistema debe automatizar los cálculos de fraccionamiento por peso e importe cobrado, manteniendo la precisión exacta del stock y la ganancia bruta.

## 2. Modalidades de Venta Clave
1. **Unidad:** Venta directa de accesorios o productos cerrados (disminuye 1 unidad).
2. **Bolsa Completa:** Venta de alimento cerrado de X kg (descuenta X kg del stock total).
3. **Fraccionado por Peso:** El cliente pide 2.5 kg. El sistema calcula `2.5 * precio_por_kg` y descuenta 2.5 kg.
4. **Fraccionado por Importe:** El cliente pide $3.000. El sistema calcula `3000 / precio_por_kg = Kilos` y descuenta exactamente esa fracción del stock.

## 3. Stack Tecnológico
- **Frontend:** React + TypeScript + Vite + Tailwind CSS v4.
- **UI & Dashboard:** Componentes accesibles (estilo shadcn/ui) + Lucide React + Recharts / Tremor.
- **State & Data Fetching:** TanStack Query (React Query) + React Hook Form + Zod.
- **Backend & Database:** Supabase (PostgreSQL).

## 4. Tipos de Datos Críticos
- Moneda/Dinero: `NUMERIC(12, 2)`
- Stock/Pesos (Kg): `NUMERIC(10, 3)`