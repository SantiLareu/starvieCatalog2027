# Auditoría pre-commit — 13 de octubre de 2026

Nota de seguimiento: este informe conserva las mediciones de la primera
auditoría. La optimización posterior de PNG16 y el build de 440,45 MB están en
`png16-audit-2026-10-13.md`. En la preparación final de Git se restauraron
`references/mobile/eternal-sweetspot.png` y `raptor.png`, cuyo borrado era
preexistente y no estaba justificado como eliminación de referencias.

Se auditó el working tree existente, sin commit, push ni deploy. Se conservaron
los cambios anteriores y las dos eliminaciones de referencias que ya existían
al iniciar la tarea. Ninguna referencia aprobada fue eliminada en esta auditoría.

## Resultado y mediciones

MB/GB decimales, sumando tamaños de archivos, no tamaño asignado en disco. El
build contiene todo `public/`; su tamaño no equivale a la descarga inicial del
usuario. `references/`, `tmp/` y los tests no se copian a `dist/`.

| Grupo | Antes | Después | Cambio |
| --- | ---: | ---: | ---: |
| `public/` | 1.576,44 MB | 1.570,96 MB | -5,48 MB |
| `dist/` | 1.577,57 MB | 1.572,09 MB | -5,48 MB |
| `src/assets/` | 0,98 MB | 0,98 MB | sin cambios |
| `references/` | 29,87 MB | 29,87 MB | sin cambios |
| `tmp/` | 1.389,95 MB | aproximadamente 959,92 MB | -430,04 MB netos |

La cifra de temporales incluye nuevos informes/capturas de esta auditoría. Se
eliminaron 2.679 archivos anteriores (471,33 MB, incluido el único asset obsoleto),
dos pruebas de compresión creadas durante esta tarea y 808 archivos de caché o
trazas intermedias creados por estas validaciones. Se conservaron capturas finales,
snapshots `before-*`, fuentes extraídas y perfiles históricos de performance.

### SAFE TO DELETE — aplicado

- `public/mobile/hard-eva-black-backpack.webp` (254.092 bytes): variante lateral
  reemplazada por `hard-eva-black-backpack-front.webp`. No hay referencias en
  código, catálogo/manifest, tests, build ni documentación necesaria. Los perfiles
  aprobados y los tests apuntan exclusivamente a la imagen frontal.
- Trazas `tmp/**/trace.zip`: artefactos generados por Playwright, regenerables
  ejecutando los specs originales conservados.
- Cachés `node-compile-cache`, `playwright-transform-cache` y archivos hash de
  transformaciones `client`/`server`: regenerables, no fuentes de la aplicación.
- Pruebas de compresión propias de esta auditoría: los resultados de hashes se
  conservaron; no son productos ni referencias de diseño.

Los targets absolutos se verificaron dentro del workspace antes de borrar. Se
usó `Remove-Item -LiteralPath` sobre archivos individuales, sin borrado recursivo
general de `tmp/` ni operaciones destructivas de Git.

### KEEP

- Las 10 referencias existentes y los cuatro archivos de `src/assets/desktop/`:
  SHA-256 sin cambios. Incluye la imagen histórica con logo integrado, documentada
  aunque ya no se importe en el stage.
- `public/catalog/pages/`, `thumbnails/` y `coverflow/`: URLs generadas desde
  JSON o nombres de producto. La ausencia de un literal en TS no demuestra desuso.
- Los **354 derivados actuales de 118 fuentes** en `productImageVariants.json`:
  todos válidos; cero derivados huérfanos.
- Imágenes originales de galerías publicadas: ProductModal todavía las usa para
  zoom y fallback. Tener un WebP equivalente no autoriza borrar el original.
- Imágenes mobile actuales, puntos dulces y fotografías reales; editorial de
  Sanyo/Tamara, firma, cancha y logo mural. Los puntos dulces permanecen intactos.
- El PNG del checkout: fuente de `scripts/build-checkout-image.mjs`; el WebP es el
  runtime, pero ambos tienen función distinta.
- `/viewer-lab`, sus utilidades, detalles y miniaturas: ruta explícita y URLs
  dinámicas. No se alteró el laboratorio ni se incorporó al flujo comercial.
- Todos los specs originales de regresión; capturas finales enlazadas en entregas
  previas y backups de trabajo.

### REVIEW MANUALLY — conservado

- `public/hero/`: **14,80 MB** de heroes/ambientes antiguos. El catálogo portrait
  habitual usa la cancha y no los solicita, pero siguen en la configuración,
  en la variante heredada de `MobilePremiumProductPage` y en tests/documentación.
  No se borraron ni se eliminaron tests para justificar su eliminación.
- **59 PNG de 16 bits: 1.350,99 MB**. Recompresión exacta de muestra:
  `Gorra 5.png`, 67.905.729 → 67.765.086 bytes, conservando 16 bits y hash de
  píxeles idéntico. El ahorro de 0,21% no justifica modificar esos maestros.
  La salida a 8 bits sería mucho menor, pero descartaría precisión original;
  no se aplicó. Este grupo domina el peso del deploy y puede ser costoso al
  solicitar zoom/fallback en mobile.
- Fotografías originales fuera de la galería publicada, como PT03/PT05/PT07
  extra de Hard Eva Black, fotos Shopify, mangos y variantes adicionales de
  palas: no son runtime actual, pero son fuentes reales potencialmente útiles.
- **15 grupos de duplicados exactos**. Algunos son derivados referenciados por
  distintas entradas del manifest; otros unen productos, laboratorio o fuentes
  de referencia. No se eliminó una identidad necesaria por tener mismos bytes.
  Ejemplos: `ETERNAL1.5.webp` en accesorios/palas/laboratorio; NAVY/MOSS PT01
  en `public/` y `references/`; MANGO/MANGOB en varios productos.
- CSS histórico `.viewer-lab-*`/`.padel-view-*` y aliases editoriales. El análisis
  textual produce falsos positivos: `drawHard`, `stf__wrapper`, `swiper-wrapper`
  y variantes `mobile-court-scene--${variant}` se generan fuera del JSX literal.
  No se aplicó un purge automático ni se modificó el layout.
- `MobileEternalEditorial.tsx`: wrapper de compatibilidad aún usado por sus tests.
  Tipos TS ausentes del bundle no son código muerto; se conservaron.
- El query `mobile-pilot` sigue siendo un deep link compatible con pruebas y
  documentación. No se simplificó la navegación para retirar su nombre histórico.
- Dos diagnósticos opcionales de `tsc --noUnusedLocals --noUnusedParameters`:
  variable `props` de `CheckoutModal.test.tsx:620` y argumento `contact` de
  `orderAttempt.ts:550`. No afectan el build normal. Se conservaron para no ampliar
  la limpieza a la interfaz de la lógica comercial.

## Optimización aplicada sin pérdida

Siete PNG de 8 bits en `public/products/bolsos/accesorio/`. PNG con compresión 9,
filtro adaptativo, sin paleta ni redimensionado, preservando metadata. Se verificó
igualdad SHA-256 de todos los píxeles decodificados, dimensiones, canales, bits y
presencia de alfa antes de escribir cada salida. Ahorro total: **5.227.089 bytes**.
Los derivados WebP existentes siguen siendo válidos porque los píxeles son los
mismos; no se cambiaron paths del catálogo ni su galería.

| Archivo | Antes (bytes) | Después (bytes) |
| --- | ---: | ---: |
| MUÑEQUERA AZUL 1.2.png | 1.066.358 | 1.030.384 |
| OVERGRIP 25 UNITS 1.png | 2.997.946 | 2.212.928 |
| OVERGRIP 25 UNITS 2.png | 3.300.926 | 2.306.681 |
| OVERGRIP 60 UNITS 1.png | 4.671.334 | 3.252.054 |
| OVERGRIP 60 UNITS 3.png | 1.425.897 | 1.078.373 |
| POWER BALANCE 2.png | 2.954.243 | 2.278.650 |
| POWER BALANCE.png | 3.413.940 | 2.444.485 |

## Loading y código

- El warmup de `Magazine` conserva portada/current/vecinos ±2 y la ventana de
  carga HTML actual. Ahora excluye todas las hojas sustituidas de P15 a P38
  **sólo en portrait**, incluyendo índice, bolsos, mochilas, neceseres y accesorios.
  La fuente de páginas sustituidas deriva de los registros actuales, no de un
  rango ad hoc disperso.
- P37/P38 siguen cargando como superficies del puente físico de contratapa:
  son una excepción necesaria conservada. No se tocó PageFlip ni BackCover.
- El modal de Key Ring todavía pinta el PDF P38 como fallback. Las tecnologías
  de palas siguen cargando su arte original bajo demanda. No se retiró `decode()`:
  protege contra parpadeos y promociones de hojas aún no decodificadas.
- P14 conserva sus miniaturas optimizadas y decode de recursos propios. Video
  conserva `preload="metadata"`. El checkout sólo se calienta con pedido abierto
  no vacío y en desktop. No se encontraron preloads globales nuevos de heroes.
- Retirados imports sin uso: `SubmitResult` en `CheckoutModal.tsx`, cuatro imports
  en `orderAttempt.test.ts` y dos en `orders.test.ts`. Ninguna función comercial ni
  aserción se eliminó.
- Vitest ahora excluye `tmp/**`, `test-results/**` y `playwright-report/**`.
  Antes recogía copias temporales de specs Playwright como suites unitarias.

## Build y chunks

El warning >500 KB continúa: un único JS de **562.125 bytes** (Vite informa
aproximadamente 157,21 KB gzip), CSS de 113.800 bytes. Las imágenes externas de
`public/` no causan ese warning.

La inspección de módulos del bundle confirma React/ReactDOM, Swiper, StPageFlip,
manifest de variantes, Magazine/engine, modal/checkout y perfiles mobile en una
entrada única. También se importa el laboratorio desde App. La contribución por
módulo se midió antes de la minificación global; no debe sumarse como peso final
de descarga. No se ocultó el warning ni se aplicó chunking sólo para silenciarlo.
Lazy loading del laboratorio o separación de chunks merece una tarea propia con
validación de arranque, navegación y límites de polling/checkout.

Mayores originales: Gorra 5 (67,91 MB), Hard Eva Black PT06 (41,30 MB), T-One Pro
PT03 (38,34 MB), Black Voltage PT03 (38,14 MB), Eternal PT04 (36,47 MB). El MP4
actual pesa 15,92 MB y el laboratorio 14,65 MB; ambos tienen consumidores reales.

## Validaciones finales

- `npm run build`: aprobado; cobertura de 32 productos, 118 fuentes, 354 derivados.
- `npm run check-products`: 32 productos válidos; advertencia preexistente de Key
  Ring sin galería, con su fallback original conservado.
- `npm test -- --maxWorkers=1`: **493 passed, 9 skipped**, 32 suites aprobadas y
  harness HTTP local omitido. No se enviaron pedidos reales ni se usó ese harness.
- **38 escenarios E2E relevantes aprobados** entre cuatro specs: cargas portrait
  y nativas (3), promoción/decode/fallos/reintentos (14), galerías/zoom/fallback
  y aperturas frías (14), showcase/navigation en cinco teléfonos y desktop/
  landscape (7). Se ejecutaron contra preview local, sin publicar nada.
- `page-image-loading.spec.ts` conserva sus siete regresiones: ahora prueba PDF
  en desktop y mobile landscape, porque P17 portrait ya es HTML. La cobertura
  portrait de reemplazos se comprobó por separado, sin cambiar la física.
- SHA-256 idéntico en las 10 referencias y cuatro assets fuente protegidos.
- `git diff --check`: limpio.

Evidencia detallada local, ignorada por Git: `tmp/precommit-audit/before.json`,
`asset-classification.json` (673 assets clasificados), `classification.json`,
`deleted.json`, `deleted-owned.json`, `optimized.json` (hashes de píxeles),
`chunks.json`, `after-sizes.json`, `code-review.json` y `e2e-final/`. El barrido
textual es evidencia auxiliar; no se trató ausencia de literal como prueba única
de desuso.

No se hizo commit, push ni deploy. La reducción grande de los originales queda
para revisión explícita: no se descartó precisión ni se borraron fuentes reales.
