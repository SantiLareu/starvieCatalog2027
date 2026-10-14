# Masters de producto PNG16

Estos 59 originales se archivaron desde `public/products/bolsos/` durante la
auditoría del 13/10/2026. Conservan todos los bytes, dimensiones, profundidad,
alpha, metadatos y perfiles de color originales. **No son assets de runtime.**
Vite copia `public/`, no esta carpeta.

Política de Git: sólo este README y `manifest.json` se versionan. Los 59 PNG
en `products/` y `catalog-before.xlsx` se conservan localmente, ignorados por
reglas ancladas de `.gitignore`. No borrar el archivo local; conservar además
un respaldo externo antes de limpiar o reemplazar esta computadora.
Una clonación limpia contiene los WebP productivos y derivados ya preparados:
`npm run build` y los checks de publicación no requieren los masters. La
regeneración de imágenes y la comparación visual PNG16/WebP sí los requieren.
El spec de comparación se omite explícitamente si falta ese archivo local;
los tests de runtime/zoom/fallback no se omiten. Restaurar los masters locales
en las rutas del manifiesto para volver a ejecutar la comparación o regenerar.

`manifest.json` registra cada procedencia, SHA-256, perfil ICC, clasificación y
ruta WebP aprobada. Tres fotos de Hard Eva Black (PT03/PT05/PT07) no pertenecen
a la galería comercial actual: se preservan aquí sin derivado productivo.
`catalog-before.xlsx` conserva el Excel anterior a la migración de 56 rutas.

Los 56 originales web mantienen resolución completa para zoom/fallback:
WebP lossless, quality 75 (esfuerzo de codificación en modo lossless), effort 3,
alphaQuality 100, sin resize y conservando el ICC original. La reducción a
RGBA de 8 bits se verificó con el perfil original; no implica conservar los
valores de edición de 16 bits. Esos valores permanecen en los masters.

Regeneración desde la raíz del proyecto:

```powershell
node scripts/build-product-originals.mjs
node scripts/build-product-images.mjs --only-masters
npm run check:product-images
```

El primer comando verifica integridad y píxeles antes de escribir. El segundo
reutiliza la identidad y bytes de los PNG de origen: conserva los nombres y
contenido de los derivados 160/768/1280 existentes. `npm run build:product-images`
sigue soportando todos los productos, usando estos masters cuando corresponde.

Los checks de publicación verifican dimensiones, alpha, perfil, tamaño y SHA
de los WebP aprobados. Una actualización deliberada de fotografía requiere
regenerar y revisar el manifiesto; no editar su hash para omitir esa revisión.

Inventario y evidencia: `docs/png16-audit-2026-10-13.md` y el CSV asociado.
