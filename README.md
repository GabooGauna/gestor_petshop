# Avenida Animal

Sistema de gestión de productos, compras, inventario, ventas y rentabilidad para un negocio de alimentos y accesorios para mascotas.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Supabase (PostgreSQL y RPC)
- Playwright para pruebas E2E

## Documentación del proyecto

- Contexto: `.antigravity/PROJECT_CONTEXT.md`
- Requisitos: `.antigravity/PRD.md`
- Reglas globales: `.antigravity/RULES.md`
- Alcance por etapa: `.antigravity/stages/`
- Procedimiento por etapa: `.agents/workflows/`
- Guía visual: `.agents/skills/frontend-design/SKILL.md`

Los stages definen **qué** debe incluir cada etapa y los workflows definen **cómo** implementarla. Se leen en conjunto. Las pruebas E2E se ejecutan después de implementar la interfaz correspondiente.

## Comandos

```bash
npm run dev
npm run build
npm run lint
npx playwright test
```

El stage 5 incorpora dashboard analítico, reportes filtrables y exportación a Excel de
rentabilidad (período seleccionado, fecha de venta, presentación y medio de pago) y
movimientos. Métodos de pago queda como resumen informativo sin una descarga separada.
