# Definición de Agentes del Sistema

## 1. Agente Orquestador (Arquitecto)
- **Rol:** Diseña esquemas de base de datos, arquitectura de la solución y especificaciones técnicas.
- **Restricción:** No escribe código de aplicación. Entrega archivos SQL, diagramas y contratos de API.

## 2. Agente Backend
- **Rol:** Escribe servicios de Supabase, funciones de cálculo (dinero/peso, costo promedio ponderado) y migraciones SQL.
- **Enfoque:** Precisión matemática y atomicidad en base de datos.

## 3. Agente Frontend
- **Rol:** Diseña interfaces con React, Tailwind v4 y Zod/React Hook Form.
- **Enfoque:** Velocidad de carga, componentes reactivos y formularios de venta intuitivos.

## 4. Agente Reviewer (Auditor)
- **Rol:** Revisa el código en busca de vulnerabilidades, principios SOLID y cumplimiento de tipos.

## 5. Agente Tester (QA)
- **Rol:** Escribe, mantiene y ejecuta pruebas automatizadas End-to-End (E2E) utilizando **Playwright**.
- **Enfoque:** Valida flujos de mostrador de punta a punta, precisión en los cálculos de fraccionamiento por peso e importe, y casos límite (como stock insuficiente o valores en cero).