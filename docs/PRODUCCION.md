# StarVie 2027 — Guía técnica y operativa de producción

Estado productivo verificado: frontend publicado en https://starvie.real-step.com.ar y API en https://api.real-step.com.ar, con Turnstile activado en ambos lados y una prueba real de extremo a extremo satisfactoria (pedido procesado, correos internos y confirmación al cliente recibidos; sin datos personales en este documento).

## 1. Arquitectura general

- Frontend React 19 + TypeScript + Vite 8, publicado como sitio estático en GitHub Pages.
- Backend externo `realstep-api` (repositorio separado, Cloudflare Worker): recibe pedidos, verifica Turnstile, recalcula precio/disponibilidad contra el catálogo vigente y envía correos vía Resend. No se modifica desde este repositorio.
- El frontend nunca envía precios como autoridad: envía identidad de contacto + cantidades (`productId`, `qty`). El Worker es la autoridad comercial.
- Versionado publicado: `products-version.json` (catálogo comercial) y `app-version.json` (frontend), consultados por polling liviano cada 60 s.

## 2. Dominios

| Pieza | URL |
| --- | --- |
| Frontend (GitHub Pages, dominio propio) | https://starvie.real-step.com.ar |
| Backend (API de pedidos) | https://api.real-step.com.ar |
| Endpoint de pedidos | `POST https://api.real-step.com.ar/api/orders` |
| Desarrollo local | `http://localhost:5173` (`npm run dev`) |

El Worker productivo solo acepta como Origin `https://starvie.real-step.com.ar`.

## 3. Estructura del proyecto

- `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `index.html`.
- `src/components/`: `Magazine.tsx`, `PageFlipEngine.tsx`, `PdfPage.tsx`, `HotspotLayer.tsx`, `ProductModal.tsx`, `CoverIntro.tsx`, `BackCover.tsx`, `PadelViewer25D.tsx`, `PadelViewerLab.tsx`, `VideoPage.tsx`, `explorer/`.
- `src/commerce/`: `CommerceContext.tsx`, `cart.ts`, `catalog.ts`, `orders.ts`, `orderAttempt.ts`, `polling.ts`, `types.ts`, `money.ts`, `CartDrawer.tsx`, `CheckoutModal.tsx`, `TurnstileWidget.tsx`.
- `src/data/`: `CatalogData.ts` (geometría manual de hotspots), `bookFlow.ts`, `hardCoverMotion.ts`, `padelViewer.ts`. `src/types/catalog.ts`. `src/test/setup.ts`.
- `catalog/products.xlsx` (fuente comercial), `catalog/products.pilot.json` (piloto histórico).
- `generated/products.json`, `generated/products-version.json` (salida del importador).
- `public/`: `products.json`, `products-version.json`, `catalog/` (`catalog.json`, `pages/`, `thumbnails/`), `checkout/`, `viewer-lab/`, `products/`.
- `scripts/`: `build-pdf-pages.mjs`, `import-products.mjs`, `seed-pilot-xlsx.mjs`, `lib/products-model.mjs`, `lib/app-version.mjs`.
- `e2e/`: `catalog.spec.ts`, `commerce.spec.ts`, `product-modal.spec.ts`, `viewer-lab.spec.ts`.
- `.github/workflows/deploy.yml`, `vite.config.ts`, `playwright.config.ts`.

## 4. Funcionamiento del catálogo interactivo

- Las 39 páginas del PDF oficial viven como imágenes WebP (`public/catalog/pages/page-01.webp` … `page-39.webp`, 1920 px, calidad 84) con miniaturas (`public/catalog/thumbnails/`, 480 px, calidad 68) y metadatos en `public/catalog/catalog.json`. El runtime nunca usa el PDF original.
- `Magazine` gestiona lectura, navegación, miniaturas y estado actual; carga miniaturas para páginas lejanas y promociona a alta resolución la portada, la página activa y sus vecinas.
- `PageFlipEngine` adapta StPageFlip a React; `PdfPage` renderiza la imagen y sus estados de carga.

## 5. Navegación, páginas y hotspots

- Portada (P1), introducción y tecnologías (P2–13), índice de palas (P14), palas (P15–26), overview de accesorios sin hotspots (P27), paleteros (P28–33), mochilas (P34–36), neceseres (P37, dos hotspots), accesorios (P38, retícula de 9), contraportada (P39).
- `HotspotLayer` dibuja zonas porcentuales escalables sobre cada página. Las coordenadas viven en `src/data/CatalogData.ts` y asocian `productId` del Excel con `pageId` física; no hay lógica comercial por categoría.
- `selectLiveHotspots` conserva un hotspot si su `productId` existe en el catálogo generado, incluso cuando `disponible=false`. La disponibilidad impide comprar el producto y afecta la reconciliación del carrito; eliminarlo del Excel desactiva el hotspot sin tocar código. Pulsar un hotspot abre `ProductModal` sin cambiar de página; al cerrarlo se conserva spread y posición.

## 6. Productos y modal

- Fuente comercial vigente: `catalog/products.xlsx` → `generated/products.json` (+ `products-version.json` con hash `sha256-…` de los bytes exactos). `CommerceContext` carga `products.json` publicado y valida con `isValidCatalog` (`schemaVersion: 1`); `products` en `CatalogData.ts` es legado editorial del piloto, conservado por compatibilidad.
- `ProductModal`: overlay oscuro, cierre superior, galería (`imagenes`), nombre, precio de exhibición, cantidad y acción de carrito. El precio mostrado es informativo; el cargo lo determina el backend.
- Imágenes de producto en `public/products/`.

## 7. Carrito y checkout

- `cart.ts` guarda solo `productId` + `qty` y reconcilia contra el catálogo vigente (líneas presentadas: existen y `disponible=true`, cantidades enteras ≥ 1). `CartDrawer.tsx` es el drawer; el checkout vacía automáticamente el carrito solo cuando el pedido llega a `completed`. El cliente también puede vaciarlo manualmente; el checkout lo conserva en `processing`/`unknown`/`failed`.
- `CheckoutModal.tsx` pide contacto obligatorio (nombre, razón social, email válido) y opcionales (teléfono, provincia, ciudad, dirección, CUIT de 11 dígitos, notas hasta 500 caracteres). Validación en `validateContact` (`orders.ts`).
- `buildOrderPayload` construye `{ contact, lines, idempotencyKey }` sin precios. `newIdempotencyKey` usa `crypto.randomUUID` y falla si no está disponible (sin fallback inseguro).
- `submitOrder(payload, { turnstileToken? })`: timeout 15 s (`ORDERS_TIMEOUT_MS`); clasifica `completed` (200/201 + `completed`), `processing` (201 `accepted`, 200/201 `processing`, o 202 siempre), `failed` (502 con `status="failed"` y `orderId` no vacío), `conflict` (409), `rateLimited` (429 + `Retry-After`), `validation` (400/401/403), `verificationRequired` (respuesta del Worker tras consultar el estado posterior a un timeout sin token: reintentar el mismo payload y key con token fresco), `unknown` (red/timeout/502 incompleto u otros 5xx ambiguos). Ante respuestas 2xx malformadas, falla cerrado.
- `VITE_API_BASE_URL` solo existe para desarrollo (apunta al harness local); en producción el modal usa `submitOrder` por defecto contra `https://api.real-step.com.ar`.

## 8. Integración con realstep-api

- `POST /api/orders` con `{ catalogId: "starvie", contact, lines, idempotencyKey, turnstileToken? }`. Constantes en `orders.ts`: `ORDERS_ENDPOINT = "/api/orders"`, `ORDERS_CATALOG_ID = "starvie"`, `ORDERS_PRODUCTION_API = "https://api.real-step.com.ar"`.
- Idempotencia: la misma key con el mismo payload recupera el pedido existente (200/202); la misma key con distinto payload devuelve 409. Tras un timeout, el checkout re-consulta primero con el mismo payload y key sin token para recuperar un pedido ya creado antes de pedir un token nuevo.
- El backend recalcula precio/disponibilidad, aplica rate limiting y envía correos (internos + confirmación al cliente) vía Resend. Detalle del harness y resultados en `docs/local-checkout-integration.md`.

## 9. Persistencia y recuperación de pedidos

Implementado en `src/commerce/orderAttempt.ts` (marcador v2, sin PII):

- `localStorage` (`starvie-order-attempt-v2`): `{ version, idempotencyKey, orderId?, lines, createdAt, completedAt?, status? }`. Sin contacto ni fingerprint.
- `sessionStorage` (`starvie-order-attempt-v2-session`): `OrderPayload` completo + snapshot de líneas + ancla `createdAt`, solo misma pestaña.
- `prepareAttempt` es el gate atómico previo al POST: si hay marcador válido solo permite reuso exacto (misma key + líneas + contacto); si no hay, escribe sesión + marcador con rollback; si está corrupto o expirado, falla cerrado sin recrear automáticamente.
- Retención ≤ 23 h desde `createdAt`; el marcador expirado no se borra solo. Nunca hay auto-envío ni auto-reintento. Tras `completed`, el cliente puede iniciar explícitamente una compra nueva. Un intento terminal requiere resolución explícita antes de iniciar otra compra; si el estado está bloqueado, la interfaz exige que el cliente confirme que consultó a StarVie.

## 10. Turnstile

- Estado: activado en frontend y backend en producción. Widget en `src/commerce/TurnstileWidget.tsx`: carga `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, render explícito con acción `order_starvie`, tamaño `normal`/`compact` según viewport, callbacks de token/expiración/error y `resetSignal`.
- El token viaja solo en el POST que lo obtiene; nunca se guarda en storage. Si falta sitekey con el flag activado, el checkout bloquea nuevos envíos.
- No colocar el secret en variables `VITE_` ni en el frontend: la verificación y el secret pertenecen al Worker.

## 11. Variables públicas de entorno

| Variable | Uso |
| --- | --- |
| `VITE_TURNSTILE_ENABLED` | `"true"` activa el widget; cualquier otro valor lo desactiva. En producción: `true`. |
| `VITE_TURNSTILE_SITE_KEY` | Site Key pública del widget de `starvie.real-step.com.ar`. En producción: la key real. |
| `VITE_API_BASE_URL` | Solo desarrollo: anula la base de la API (p. ej. `http://127.0.0.1:8787`). No definir en producción. |

Vite las incorpora al bundle durante el build: cambiar una variable de GitHub no modifica un sitio ya publicado; requiere rebuild + deploy. La clave de prueba oficial de Cloudflare (`1x00000000000000000000AA`) es solo para tests locales.

## 12. GitHub Actions y GitHub Pages

Workflow `.github/workflows/deploy.yml`: se dispara con push a `main` y `workflow_dispatch`. Job `build` (checkout, Node 22, `npm ci`, `npm run build` con `VITE_TURNSTILE_ENABLED` y `VITE_TURNSTILE_SITE_KEY` leídas de **variables** del repositorio, `false`/vacío por defecto; `configure-pages`, subida del artefacto `./dist`) y job `deploy` (environment `github-pages`, `deploy-pages`). Todo push a `main` publica automáticamente.

## 13. Actualización del catálogo

- Comercial: editar `catalog/products.xlsx`, luego `node scripts/import-products.mjs catalog/products.xlsx` (regenera `generated/` y copia a `public/`); verificar con `npm run check-products` (`--check`, falla si `generated/` no está actualizado; `--check-images` opcional). Alta de producto: agregar fila en el Excel y, si necesita hotspot, entrada con `productId` + `pageId` + coordenadas en `src/data/CatalogData.ts`.
- Páginas PDF: `npm run build:pdf-pages` (Poppler `pdftoppm`/`pdfinfo`; variables `PDFTOPPM_PATH`/`PDFINFO_PATH` si no están en `PATH`). Semilla piloto: `npm run products:seed`.
- `vite.config.ts`: `publishedCommercePlugin` sirve `products.json`/`products-version.json` sin caché en dev y los emite en `dist`; `appVersionPlugin` inyecta `<meta name="starvie-app-version">`, sirve `/app-version.json` dinámico en dev y escribe `dist/app-version.json` con SHA-256 reales por archivo.

## 14. Procedimientos de publicación

- Frontend: verificar `npm test`, `npm run build` y `git diff --check`; confirmar variables de Actions (`VITE_TURNSTILE_ENABLED=true`, `VITE_TURNSTILE_SITE_KEY` real); push a `main` solo con autorización explícita (activa Pages automáticamente).
- Backend (`realstep-api`, otro repositorio): comprobar que el Worker publicado incluya secret, hostname, acción `order_starvie` y habilitación de `starvie`, sin exponer el secret; coordinar el orden frontend/backend antes de cada activación.

## 15. Validaciones y pruebas existentes

- `npm test` (`vitest run`; `test:watch` para modo interactivo): unitarios de commerce, componentes (`CartDrawer`, `CheckoutModal`, `ProductModal`, `VideoPage`), datos (`CatalogData`, `bookFlow`, `hardCoverMotion`) y utilidades.
- `src/commerce/localHttp.test.tsx`: harness HTTP especial Windows ↔ WSL contra Miniflare; se ejecuta por separado con `STARVIE_LOCAL_INTEGRATION=1` (ver `docs/local-checkout-integration.md`). Resultado de referencia 27-09-2026: 9/9; suites habituales 232 commerce / 293 frontend aprobadas con 9 omitidas (las del harness); backend 85 aprobadas.
- `npm run test:e2e` (Playwright): `catalog`, `commerce`, `product-modal`, `viewer-lab`. `npm run check-products`: coherencia Excel ↔ generados.

## 16. Verificaciones posteriores a cada deploy

- Abrir https://starvie.real-step.com.ar: portada, navegación, miniaturas, un hotspot y su modal.
- Comprobar publicados: `/products.json`, `/products-version.json`, `/app-version.json`, `/catalog/catalog.json` y una página de `page-*.webp`.
- Confirmar en el bundle la versión de app y que el widget de Turnstile renderiza en el checkout (sin enviar pedidos reales).
- Revisar la pestaña Actions del deploy y repetir `git diff --check` si hubo cambios.

## 17. Troubleshooting

| Síntoma | Causa probable / acción |
| --- | --- |
| Checkout bloquea envíos | `VITE_TURNSTILE_ENABLED=true` sin `VITE_TURNSTILE_SITE_KEY`: definir la key y rebuild. |
| `verificationRequired` tras timeout | Reintentar el mismo payload y key con token fresco (flujo previsto, no error). |
| 409 en reintento | La key se reusó con distinto payload: revisar `orderAttempt` y no mutar carrito/contacto del intento. |
| 429 | Rate limiting: respetar `Retry-After` y reintentar después. |
| 502 con `status="failed"` y `orderId` | Fallo terminal confirmado: conservar la referencia y resolver el intento antes de iniciar otra compra. |
| 502 incompleto o sin estado concluyente | Resultado incierto: conservar el intento persistido y recuperarlo con el mismo payload y la misma key dentro de la ventana de idempotencia. |
| Catálogo vacío o inválido | `products.json` con `schemaVersion` distinto de 1 o producto malformado: regenerar con `import-products` y `check-products`. |
| Página en blanco "No se pudo cargar el catálogo" | Falta `public/catalog/catalog.json`: ejecutar `build:pdf-pages`. |
| Cambios de variables sin efecto | Están compiladas en el bundle: rebuild + nuevo deploy. |
| CORS 403 en local | Esperable sin el adaptador del harness; usar el harness documentado. |

## 18. Limitaciones actuales y mejoras futuras

- Estado actual verificado: despliegue publicado, Turnstile activo en ambos lados y prueba real satisfactoria. No hay pendientes de activación conocidos.
- Limitaciones: el frontend es estático (sin SSR); el catálogo de páginas requiere rebuild del pipeline PDF ante cambios del PDF; el polling es cada 60 s y respeta pestaña oculta; la recuperación de intentos expira a las 23 h y exige reingreso manual si se pierde la sesión; los precios del frontend son informativos.
- Mejoras futuras (no implementadas, no presentar como hechas): notificaciones de actualización de app/catálogo más visibles, observabilidad del checkout, ampliación del laboratorio viewer-lab, optimización adicional de imágenes. Cualquier mejora requiere autorización y debe preservar el comportamiento del catálogo, navegación, hotspots, carrito y checkout.
