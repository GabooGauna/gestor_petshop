# Sistema de Gestión de Stock, Ventas y Rentabilidad para Negocio de Alimentos y Accesorios para Mascotas

## 1. Descripción general

El sistema tiene como objetivo administrar el inventario, las compras, las ventas, los costos y la rentabilidad de un negocio dedicado a la comercialización de alimentos para animales y artículos para mascotas.

El sistema deberá contemplar diferentes modalidades de comercialización:

* Productos vendidos por unidad.
* Alimentos vendidos por bolsa completa.
* Alimentos vendidos fraccionados por peso.
* Alimentos vendidos según un importe solicitado por el cliente.

La información registrada permitirá conocer en todo momento:

* Qué productos posee el negocio.
* Cuánto stock disponible existe.
* Cuánto costó cada producto.
* A qué precio se está vendiendo.
* Cuánto dinero ingresó por las ventas.
* Cuál fue el costo de la mercadería vendida.
* Cuál es la ganancia bruta generada.
* Qué productos se están agotando.
* Qué productos generan mayores ventas.

---

# 2. Objetivo principal

El sistema deberá permitir que el negocio registre sus operaciones de manera sencilla y que, a partir de esos datos, calcule automáticamente el stock y la rentabilidad.

La intención es que el usuario solamente tenga que informar la operación realizada y que el sistema se encargue de realizar los cálculos correspondientes.

Por ejemplo:

El usuario registra:

> Producto: Whiskas Pescado para gatos
> Importe cobrado: $3.000

El sistema deberá determinar, según el precio configurado para ese producto, qué cantidad corresponde a esos $3.000, descontarla del stock y calcular el costo y la ganancia de la operación.

De la misma manera, si el usuario registra:

> Producto: Dog Chow Adultos
> Presentación: Bolsa 20 kg
> Cantidad: 1
> Importe cobrado: $35.000

el sistema deberá descontar los 20 kg correspondientes de la existencia y calcular la rentabilidad de esa venta.

---

# 3. Conceptos principales

## 3.1 Producto

Representa aquello que comercializa el negocio.

Ejemplos:

* Whiskas Pescado.
* Dog Chow Adultos.
* Dog Chow Cachorros.
* Correa para perro.
* Collar.
* Plato.
* Juguete.
* Shampoo.
* Piedras sanitarias.

Cada producto tendrá información básica como:

* Código.
* Nombre.
* Categoría.
* Marca.
* Tipo de comercialización.
* Unidad de medida.
* Estado activo/inactivo.

---

# 4. Tipos de productos

El sistema deberá diferenciar al menos dos grandes tipos.

## 4.1 Productos vendidos por unidad

Ejemplo:

Correa:

* Costo: $5.000
* Precio de venta: $8.000
* Stock: 15 unidades

Una venta de una correa disminuye el stock en una unidad.

---

## 4.2 Productos vendidos por peso

Ejemplo:

Whiskas Pescado:

* Presentación original: 10 kg.
* Costo de la bolsa: $20.000.
* Costo por kg: $2.000.
* Precio de venta por kg: $2.800.

El producto puede venderse:

* Por kilogramo.
* Por gramos.
* Por un importe determinado.

---

# 5. Presentaciones

Los alimentos podrán tener diferentes presentaciones.

Por ejemplo:

Dog Chow Adultos:

* Bolsa de 10 kg.
* Bolsa de 20 kg.
* Bolsa de 30 kg.

Cada presentación podrá tener su propio:

* Costo.
* Peso.
* Precio de venta.
* Stock.

Por lo tanto, una bolsa de 20 kg será considerada una presentación específica del producto Dog Chow Adultos.

---

# 6. Carga de productos

El usuario deberá poder registrar los productos que comercializa el negocio.

Para cada producto podrá indicar:

* Nombre.
* Marca.
* Categoría.
* Tipo de producto.
* Forma de comercialización.
* Presentación.
* Peso.
* Costo de adquisición.
* Precio de venta.
* Precio de venta por kg, cuando corresponda.
* Stock mínimo.
* Estado.

Ejemplo:

### Producto

Whiskas Pescado

### Presentación

Bolsa 10 kg

### Costo

$20.000

### Costo por kg

$2.000

### Precio de venta por kg

$2.800

### Stock

50 kg

---

# 7. Compras al proveedor

El sistema deberá permitir registrar el ingreso de mercadería al negocio.

Ejemplo:

Proveedor:

Distribuidora XYZ

Producto:

Dog Chow Adultos

Presentación:

20 kg

Cantidad:

10 bolsas

Costo unitario:

$25.000

Costo total:

$250.000

Al confirmar la compra, el sistema deberá aumentar automáticamente el stock.

En este caso:

10 bolsas × 20 kg = 200 kg

El inventario aumentará en 200 kg.

---

# 8. Actualización de costos

El costo de los productos puede variar con cada compra.

Ejemplo:

Compra anterior:

20 kg → $25.000

Compra nueva:

20 kg → $28.000

El sistema deberá registrar ambos movimientos.

Además, se deberá definir como regla de negocio cómo se determinará el costo utilizado para calcular la rentabilidad.

Podrá utilizarse, por ejemplo:

* Último costo.
* Costo promedio ponderado.

Esta definición deberá establecerse durante el relevamiento con el cliente.

---

# 9. Registro de ventas

La venta será registrada manualmente por el usuario.

El usuario deberá indicar como mínimo:

* Producto vendido.
* Presentación, si corresponde.
* Cantidad o importe.
* Precio o importe cobrado.

Una venta podrá contener uno o varios productos.

Ejemplo:

### Venta

Whiskas Pescado
Cantidad: 2 kg
Importe: $5.600

Correa roja
Cantidad: 1 unidad
Importe: $8.000

Total:

$13.600

---

# 10. Venta por importe

Una de las funcionalidades principales será permitir que el usuario registre una venta indicando directamente cuánto dinero pagó el cliente.

Ejemplo:

Cliente:

> "Dame $3.000 de Whiskas de pescado."

El usuario registra:

Producto:

Whiskas Pescado

Importe cobrado:

$3.000

Precio por kg:

$2.800

El sistema calcula:

$3.000 / $2.800 = 1,071 kg

Por lo tanto, la venta será registrada como:

Whiskas Pescado
Cantidad: 1,071 kg
Importe: $3.000

El sistema descontará 1,071 kg del stock.

---

# 11. Venta por cantidad

También deberá permitirse indicar directamente una cantidad.

Ejemplo:

Producto:

Whiskas Pescado

Cantidad:

2,5 kg

Precio por kg:

$2.800

El sistema calculará:

2,5 × $2.800 = $7.000

La venta quedará registrada como:

2,5 kg → $7.000

---

# 12. Venta de bolsa completa

Los alimentos también podrán venderse como una presentación cerrada.

Ejemplo:

Producto:

Dog Chow Adultos

Presentación:

Bolsa 20 kg

Cantidad:

1

Precio:

$35.000

El sistema deberá descontar del stock:

20 kg

La venta quedará registrada como:

Dog Chow Adultos 20 kg
Cantidad: 1 bolsa
Importe: $35.000

---

# 13. Cálculo de costo de la venta

Cada venta deberá poder asociarse con el costo de la mercadería vendida.

Ejemplo:

Dog Chow 20 kg:

Costo:

$25.000

Precio de venta:

$35.000

Ganancia bruta:

$10.000

En una venta fraccionada:

Costo por kg:

$1.250

Venta:

3 kg × $1.750 = $5.250

Costo:

3 × $1.250 = $3.750

Ganancia bruta:

$1.500

Esto permitirá generar reportes de rentabilidad.

---

# 14. Control de rentabilidad

El sistema deberá mostrar información relacionada con la rentabilidad de cada producto.

Por ejemplo:

Producto:

Dog Chow Adultos

Costo por kg:

$1.250

Precio de venta:

$1.750

Ganancia por kg:

$500

Margen:

40%

También podrá existir un precio mínimo de venta calculado a partir de un margen mínimo configurado.

Por ejemplo:

Costo:

$1.250

Margen mínimo:

20%

Precio mínimo:

$1.500

Si el usuario registra una venta por debajo de ese valor, el sistema podrá mostrar una advertencia.

La decisión de permitir o impedir la operación deberá definirse con el cliente.

---

# 15. Inventario

El sistema deberá mantener actualizado el stock automáticamente.

El stock podrá aumentar por:

* Compra.
* Ajuste positivo.

Y disminuir por:

* Venta.
* Merma.
* Ajuste negativo.

Ejemplo:

Stock inicial:

100 kg

Venta:

3 kg

Merma:

0,5 kg

Stock actual:

96,5 kg

---

# 16. Movimientos de stock

Toda modificación del inventario deberá generar un registro de movimiento.

Ejemplo:

| Fecha | Tipo   | Producto | Cantidad |
| ----- | ------ | -------- | -------: |
| 01/10 | Compra | Dog Chow |  +200 kg |
| 01/10 | Venta  | Dog Chow |   -20 kg |
| 01/10 | Venta  | Dog Chow |    -3 kg |
| 02/10 | Merma  | Dog Chow |  -0,5 kg |

Esto permitirá conocer el historial del inventario y detectar diferencias entre el stock físico y el stock registrado.

---

# 17. Ajustes de inventario

El sistema deberá permitir realizar ajustes manuales.

Ejemplo:

Stock del sistema:

50 kg

Stock físico:

48,5 kg

El usuario registra:

Ajuste:

-1,5 kg

Motivo:

Diferencia de inventario

El sistema actualizará el stock y guardará el motivo del ajuste.

---

# 18. Mermas

El negocio podrá registrar pérdidas de mercadería.

Ejemplos:

* Alimento derramado.
* Producto dañado.
* Producto vencido.
* Rotura.
* Pérdida de mercadería.

Cada merma deberá generar un movimiento de stock y guardar el motivo.

---

# 19. Métodos de pago

Cada venta podrá registrar el método de pago utilizado.

Por ejemplo:

* Efectivo.
* Transferencia.
* Débito.
* Crédito.
* Mercado Pago.
* Otro.

Esto permitirá obtener reportes de ingresos por medio de pago.

---

# 20. Caja y ventas del día

El sistema deberá poder mostrar un resumen diario.

Ejemplo:

### Ventas del 01/10/2026

Ventas totales:

$185.000

Efectivo:

$75.000

Transferencias:

$80.000

Tarjetas:

$30.000

Costo de mercadería:

$130.000

Ganancia bruta:

$55.000

---

# 21. Reportes

El sistema deberá generar distintos reportes.

## Reporte de stock

Mostrar:

* Producto.
* Presentación.
* Stock actual.
* Unidad.
* Stock mínimo.
* Estado.

---

## Reporte de stock bajo

Mostrar los productos cuyo stock se encuentre por debajo del mínimo definido.

Ejemplo:

Whiskas Pescado:

Stock actual: 7 kg

Stock mínimo: 15 kg

Estado:

REABASTECER

---

## Reporte de ventas

Permitir consultar:

* Ventas por día.
* Ventas por período.
* Ventas por producto.
* Cantidad vendida.
* Importe vendido.

---

## Reporte de rentabilidad

Mostrar:

* Ventas.
* Costo.
* Ganancia bruta.
* Margen.

Por producto y por período.

---

## Reporte de movimientos

Permitir consultar todo movimiento realizado sobre el inventario.

Ejemplo:

* Compras.
* Ventas.
* Ajustes.
* Mermas.

---

# 22. Ejemplo de operación completa

## Compra

Se compran:

10 bolsas Dog Chow de 20 kg.

Costo:

$25.000 por bolsa.

El sistema registra:

Stock:

+200 kg

Costo:

$25.000 por bolsa

Costo por kg:

$1.250

---

## Configuración del precio

Se establece:

Precio de venta por bolsa:

$35.000

Precio de venta por kg:

$1.750

---

## Venta 1

Cliente solicita:

> $3.000 de Dog Chow.

El usuario registra:

Producto:

Dog Chow

Importe:

$3.000

El sistema calcula:

$3.000 / $1.750 = 1,714 kg

Stock:

200 kg → 198,286 kg

Costo:

1,714 × $1.250 = aproximadamente $2.143

Ganancia:

$3.000 - $2.143 = aproximadamente $857

---

## Venta 2

Otro cliente compra:

1 bolsa de 20 kg.

Importe:

$35.000

Stock:

198,286 kg → 178,286 kg

Costo:

$25.000

Ganancia:

$10.000

---

## Resultado

El sistema podrá mostrar:

Ventas:

$38.000

Costo:

aproximadamente $27.143

Ganancia bruta:

aproximadamente $10.857

Stock:

178,286 kg

---

# 23. Pantallas principales

La primera versión del sistema podría estar compuesta por:

### Dashboard

Mostrar:

* Ventas del día.
* Ganancia del día.
* Productos con stock bajo.
* Últimas ventas.
* Stock total.

### Productos

Alta, modificación, consulta y baja lógica.

### Compras

Carga de compras y recepción de mercadería.

### Ventas

Registro de ventas.

### Inventario

Consulta del stock y movimientos.

### Proveedores

Gestión de proveedores.

### Reportes

Consulta de ventas, stock y rentabilidad.

### Configuración

Usuarios, parámetros, márgenes y otras configuraciones.

---

# 24. Flujo principal del negocio

El funcionamiento general será:

PROVEEDOR

↓

COMPRA

↓

INGRESO DE MERCADERÍA

↓

STOCK

↓

VENTA

↓

DESCUENTO DE STOCK

↓

CÁLCULO DE COSTO

↓

CÁLCULO DE GANANCIA

↓

REPORTES

---

# 25. Regla fundamental del sistema

La información ingresada por el usuario deberá representar la operación real del negocio.

El sistema no deberá obligar al usuario a realizar cálculos manuales.

Por ejemplo, si el cliente paga:

$3.000

el usuario solamente deberá indicar:

> Producto = Whiskas Pescado
> Importe = $3.000

El sistema deberá determinar automáticamente la cantidad vendida utilizando el precio configurado.

Del mismo modo, si el usuario indica:

> Producto = Dog Chow 20 kg
> Cantidad = 1 bolsa
> Precio = $35.000

el sistema deberá determinar automáticamente:

* Cantidad de stock a descontar.
* Costo.
* Ganancia.
* Impacto en los reportes.

---

# 26. Alcance inicial del proyecto

La primera versión deberá contemplar:

1. Gestión de productos.
2. Gestión de categorías.
3. Gestión de proveedores.
4. Gestión de presentaciones.
5. Registro de compras.
6. Control de stock.
7. Registro manual de ventas.
8. Venta por unidad.
9. Venta por peso.
10. Venta por importe.
11. Venta de bolsas completas.
12. Cálculo de costos.
13. Cálculo de ganancias.
14. Control de stock mínimo.
15. Movimientos de inventario.
16. Ajustes.
17. Mermas.
18. Métodos de pago.
19. Reportes de ventas.
20. Reportes de stock.
21. Reportes de rentabilidad.

---

# 27. Evolución futura

El sistema podrá ampliarse posteriormente para incorporar:

* Clientes.
* Clientes frecuentes.
* Precios mayoristas.
* Descuentos.
* Promociones.
* Código de barras.
* Impresión de tickets.
* Caja diaria.
* Cierre de caja.
* Usuarios y permisos.
* Auditoría.
* Alertas de reposición.
* Historial de precios.
* Dashboard avanzado.
* Integración con medios de pago.
* Integración con facturación.
* Aplicación móvil.

---

# 28. Definición conceptual final

El sistema será una herramienta de gestión para el negocio que permitirá registrar las compras y ventas de productos, mantener actualizado el inventario y determinar la rentabilidad de las operaciones.

El usuario será responsable de registrar la operación realizada, indicando el producto comercializado y el importe o cantidad correspondiente. A partir de esta información, el sistema realizará automáticamente los cálculos necesarios para determinar la cantidad vendida, modificar el stock, determinar el costo de la mercadería y calcular la ganancia obtenida.

El sistema deberá contemplar especialmente la comercialización de alimentos en diferentes presentaciones y su posterior venta fraccionada por peso o por importe, permitiendo conocer con precisión la cantidad de alimento disponible y la rentabilidad obtenida en cada operación.

La información registrada será utilizada para generar reportes de ventas, inventario, costos, ganancias y movimientos de stock, proporcionando al negocio una visión integral de su funcionamiento.
