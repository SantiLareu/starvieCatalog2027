# Exportación de productos StarVie 2027

Desktop ofrece **Excel** en el header. Mobile ofrece **Descargar Excel** en el pie fijo del menú de miniaturas, encima de Contacto. El modal permite descargar el catálogo completo, una categoría o una categoría y subcategoría.

La fuente es el catálogo publicado que ya mantiene `CommerceProvider` en memoria (`products.json`). Se incluyen todos los productos publicados, también `disponible=false`, sin filtrar por SKU vacío o precio cero. Una fila del importador equivale a una fila exportada; no se agregan variantes ni registros de stock.

El archivo contiene una sola hoja `Productos` y cinco columnas: `SKU`, `Nombre`, `Categoría`, `Subcategoría`, `Precio`. Los identificadores y descripciones son texto; los precios conocidos son números. Un SKU vacío se exporta como celda vacía. Un precio vacío conserva la celda vacía y un cero real se exporta como número `0`.

## Importación y sincronización

El flujo habitual sigue siendo `catalog/products.xlsx` → `npm run import-products` → archivos generados/publicados → build y publicación. No se publica ni descarga el Excel administrativo.

La semántica comercial existente convierte tanto precio vacío como cero en `precio: null`. Para conservar la distinción en la exportación, el importador añade `zeroPriceProductIds` al mismo `products.json`. Es una lista de IDs con precio cero en el Excel, ordenada según los productos. Los objetos de producto y su precio comercial permanecen intactos. La lista participa en el hash de versión: cambiar de cero a vacío también actualiza el catálogo en memoria mediante el polling existente.

Un catálogo anterior sin esa lista sigue siendo compatible. Su `precio: null` se exporta vacío, porque no existe información para atribuirle un cero. Después de ejecutar el importador actualizado se conserva la distinción exacta, sin mantener otro catálogo ni actualizar archivos manualmente.

## Implementación y comprobaciones

`src/export/catalogExport.ts` filtra y prepara filas sin mutar el catálogo. `exportWorkbook.ts` importa ExcelJS al generar la descarga; Vite utiliza el bundle de navegador de la dependencia ya instalada. El modal mantiene opciones dinámicas, contador, bloqueo de envíos duplicados, manejo de errores y foco de teclado. El catálogo queda inerte mientras el modal está abierto y el guard existente de recarga considera esta interfaz ocupada.

Comprobaciones locales:

- `npm run check-products`
- `npm test`
- `npm run build`
- `npm run test:e2e -- e2e/export-products.spec.ts e2e/desktop-contact.spec.ts e2e/mobile-contact.spec.ts e2e/back-cover-orientation.spec.ts e2e/final-visual.spec.ts e2e/navigation-race.spec.ts`
- `git diff --check`

Las pruebas de exportación leen las descargas con ExcelJS y verifican hoja, columnas, filas, tipos de celda, filtros, actualización por polling y navegación. Las capturas y XLSX de revisión se guardan en directorios temporales, fuera de los archivos fuente.

## Archivos de esta implementación

- `src/components/Magazine.tsx`: accesos y estado del modal.
- `src/export/ExportCatalogModal.tsx`, `catalogExport.ts`, `exportWorkbook.ts`: interfaz, selección y descarga.
- `src/export/export.css`, `export-controls.css`: estilos específicos.
- `src/export/ExportCatalogModal.test.tsx`, `catalogExport.test.ts`, `exportWorkbook.test.ts`: pruebas unitarias nuevas.
- `e2e/export-products.spec.ts`: pruebas de navegador nuevas.
- `scripts/import-products.mjs`, `scripts/lib/products-model.mjs` y `products-model.test.mjs`: metadatos de ceros y comprobaciones.
- `src/commerce/types.ts`, `catalog.ts` y `catalog.test.ts`: tipado y validación de los metadatos opcionales.
- `generated/products.json`, `generated/products-version.json`, `public/products.json`, `public/products-version.json`: salidas reproducibles del importador.
- `docs/EXPORTACION_EXCEL.md`: esta documentación.

Los objetos de producto publicados, el Excel administrativo y los archivos del motor, contratapa, estilos de Contacto, carrito y checkout no se modificaron.

### Observación de la validación local

`navigation-race.spec.ts` en Chromium mobile presentó fallos al intentar enviar y observar gestos durante animaciones breves. El fallo también se reprodujo ejecutando una copia temporal del código del commit aprobado `6832943`, sin esta exportación. No se modificó esa prueba ni el motor. Las dos comprobaciones de contratapa sensibles al timing que fallaron en paralelo pasaron al repetirse en secuencia.
