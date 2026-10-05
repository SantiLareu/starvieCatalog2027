# Productos pendientes de precio o SKU

El Excel sigue siendo la fuente del catálogo. `id` es obligatorio y único;
`nombre` y `disponible` son obligatorios. No se usan SKU como identidad.

- Precio realmente vacío (`null`, celda sin valor o cadena vacía) o 0: se
  serializa como `precio: null`. Un número positivo mantiene su precio.
- Negativos, texto no numérico, whitespace, booleanos y objetos: error de
  importación. No se convierten en 0. Se conservan los decimales con coma.
- SKU vacío: `sku: ""`. Los SKU informados mantienen su validación de unicidad.
- Las columnas `precio` y `sku` continúan presentes en la plantilla.

El catálogo y su manifiesto conservan `schemaVersion: 1`; el contrato de precio
se amplía de `number` a `number | null`. El cliente nuevo también acepta números
0 de catálogos anteriores, tratándolos como ausencia para visualización monetaria.
Un cliente anterior que exige números rechazará un catálogo con null: publicar
catálogo y frontend actualizado juntos. Cualquier consumidor externo debe
soportar este contrato antes de consumir el nuevo JSON.

Un producto pendiente permanece visible y resoluble por hotspot. La ficha
oculta el precio y la referencia ausentes, sin texto comercial de reemplazo.
La disponibilidad permite agregar al pedido; ni el precio ni el SKU pendientes
impiden pedir. Cantidades y líneas persisten aunque se retire el precio.
Los cambios de precio mantienen su actualización silenciosa.

Los subtotales sin precio y cualquier total incompleto se representan como null
y se ocultan en la UI. Nunca se suma un precio pendiente como cero ni se muestra
un total parcial como completo. El checkout acepta estas líneas y los reintentos
conservan el payload y la clave de idempotencia. El backend sigue siendo la
autoridad para precios y disponibilidad; el payload solo lleva identidad y
cantidad. Este cambio no modifica el backend externo.

La implementación local revisada de `realstep-api/src/worker.js` todavía exige
un precio numérico y calcula subtotales/totales y correos con esos importes.
Para tomar pedidos con `precio: null`, el Worker debe aceptar el estado
pendiente y evitar importes falsos también en sus registros y correos. La
compatibilidad del payload (identidad + cantidad) no resuelve esta validación.

Las validaciones de rutas de imagen siguen vigentes: rutas relativas bajo
`products/`, extensiones WebP/JPG/JPEG/PNG, sin rutas absolutas ni traversal.
No se alteran los datos del Excel durante la importación.
