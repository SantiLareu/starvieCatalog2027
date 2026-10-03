# StarVie 2027 — Documentación técnica completa

Estado productivo verificado: frontend publicado en https://starvie.real-step.com.ar y API en https://api.real-step.com.ar, con Turnstile activado en ambos lados y una prueba real de extremo a extremo satisfactoria (pedido procesado, correos internos y confirmación al cliente recibidos; sin datos personales en este documento).

Este documento describe el estado REAL del código. Cuando el motivo de una decisión pudo determinarse por código, tests, comentarios o documentación existente, se explica en una subsección “Por qué está implementado así”. Cuando no pudo determinarse con certeza, se marca explícitamente como **motivo no determinable**.

## 1. Arquitectura general

- Frontend React 19 + TypeScript + Vite 8, publicado como sitio estático en GitHub Pages. No hay SSR ni backend propio en este repositorio.
- Backend externo `realstep-api` (repositorio separado, Cloudflare Worker): recibe pedidos, verifica Turnstile, recalcula precio/disponibilidad contra el catálogo vigente y envía correos vía Resend. No se modifica desde este repositorio.
- El frontend nunca envía precios como autoridad: envía identidad de contacto + cantidades (`productId`, `qty`). El Worker es la autoridad comercial.
- Versionado publicado: `products-version.json` (catálogo comercial) y `app-version.json` (frontend), consultados por polling liviano cada 60 s.
- Entrada: `src/App.tsx` decide entre catálogo (`CatalogApp` + `CommerceProvider` + `Magazine`) y laboratorio (`PadelViewerLab` vía ruta `/viewer-lab` o `?viewer-lab`). Si falta `public/catalog/catalog.json`, muestra “No se pudo cargar el catálogo. Ejecuta npm run build:pdf-pages.”

### Por qué está implementado así

La separación frontend estático / Worker externo existe para que el catálogo sea un sitio estático barato de publicar (GitHub Pages) mientras toda la autoridad comercial (precios, stock, correos) vive en el Worker. Que el frontend no envíe precios evita que un cliente manipulado imponga importes: el comentario en `src/commerce/orders.ts` lo declara (“El frontend NUNCA manda precios como autoridad”).

## 2. Dominios

| Pieza | URL |
| --- | --- |
| Frontend (GitHub Pages, dominio propio) | https://starvie.real-step.com.ar |
| Backend (API de pedidos) | https://api.real-step.com.ar |
| Endpoint de pedidos | `POST https://api.real-step.com.ar/api/orders` |
| Desarrollo local | `http://localhost:5173` (`npm run dev`) |

El Worker productivo solo acepta como Origin `https://starvie.real-step.com.ar` (consta en `docs/local-checkout-integration.md`: el test `x-local-raw-origin: 1` demuestra que sin adaptador responde 403 a localhost).

## 3. Estructura del frontend

- `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `index.html`.
- `src/components/`: `Magazine.tsx` (lectura y navegación), `PageFlipEngine.tsx` (adaptador StPageFlip), `PdfPage.tsx` (imagen y estados de carga), `HotspotLayer.tsx` (zonas por página), `ProductModal.tsx` (+ `ProductImage.tsx`, `ProductGalleryImage.tsx`), `Page14Coverflow.tsx` (+ `page14-coverflow.css`), `VideoPage.tsx`, `CoverIntro.tsx`, `BackCover.tsx`, `PadelViewer25D.tsx`, `PadelViewerLab.tsx`, `explorer/` (`PadelExplorer`, `ProductDetailViewer`, `ProductHotspots`, `ProductViewNavigation`, `ProductViewStage`, `gestures`, `images`).
- `src/commerce/`: `CommerceContext.tsx`, `cart.ts`, `catalog.ts`, `orders.ts`, `orderAttempt.ts`, `polling.ts`, `types.ts`, `money.ts`, `CartDrawer.tsx`, `CheckoutModal.tsx`, `TurnstileWidget.tsx`.
- `src/data/`: `CatalogData.ts` (geometría manual de hotspots), `bookFlow.ts`, `hardCoverMotion.ts`, `padelViewer.ts`, `productImageVariants.json`. `src/types/catalog.ts`, `src/types/page-flip.d.ts`. `src/test/setup.ts`.
- `catalog/products.xlsx` (fuente comercial), `catalog/products.pilot.json` (piloto histórico).
- `generated/products.json`, `generated/products-version.json` (salida del importador).
- `public/`: `products.json`, `products-version.json`, `catalog/` (`catalog.json`, `pages/`, `thumbnails/`, `coverflow/`, `product-images/`), `checkout/` (hero del checkout), `viewer-lab/`, `products/` (imágenes por producto: `palas/`, `bolsos/`), `videos/` (`news.mp4`).
- `scripts/`: `build-pdf-pages.mjs`, `build-coverflow-images.mjs` (portadas del carrusel desde `generated/products.json`), `build-product-images.mjs` (manifiesto de imágenes, sin datos comerciales), `build-checkout-image.mjs` (PNG → WebP del hero), `import-products.mjs`, `seed-pilot-xlsx.mjs` (genera el Excel piloto Raptor+), `clean-pala-pages.py` (retira de las páginas P15–P26 pastilla MENU, filas P.V.P./STREET PRICE y bloque de tracking — coherente con que el precio lo determina el backend), `lib/products-model.mjs`, `lib/app-version.mjs`.
- `e2e/`: 14 specs (ver §17). `.github/workflows/deploy.yml`, `vite.config.ts`, `playwright.config.ts`, `playwright.preview.config.ts` (preview de producción, sin script npm propio; ver §19).

## 4. Pipeline PDF / imágenes

- Fuente: el PDF vive en `starvie-2027/STARVIE COLECCIÓN 2027 ES VF.pdf` (con fallback a `references/starvie-2027/`). El script `build-pdf-pages.mjs` lo convierte con Poppler (`pdftoppm`/`pdfinfo`, con override `PDFTOPPM_PATH`/`PDFINFO_PATH`) y Sharp a WebP.
- Salida real (según `public/catalog/catalog.json`): 39 páginas de 1920 × 1080 px (calidad 84) en `public/catalog/pages/page-01.webp` … `page-39.webp`, miniaturas de 480 px (calidad 68) en `public/catalog/thumbnails/`, más `catalog.json` con dimensiones, bytes y relación 16:9. El runtime nunca usa el PDF original.
- Imágenes derivadas: `build-coverflow-images.mjs` (carrusel P14 → `public/catalog/coverflow/`), `build-product-images.mjs` (fichas → `public/catalog/product-images/` y `public/products/`), `build-checkout-image.mjs` (hero del checkout, `CHECKOUT_HERO_SRC = "/checkout/checkout-hero-raptor.webp"`).
- `index.html` precarga la portada (`/catalog/pages/page-01.webp`, `fetchpriority="high"`).

### Por qué está implementado así

Renderizar el PDF a imágenes fijas evita depender de un visor PDF en el navegador y garantiza fidelidad editorial total. Las miniaturas de baja resolución permiten navegación fluida (el `Magazine` carga miniaturas para páginas lejanas y promueve a alta resolución portada, activa y vecinas). La nota de `docs/catalog-visual-quality.md` deja constancia de que 1920 px es suficiente para pantallas estándar y que subir a 2560 px sería una mejora separada con costo de peso/memoria.

## 5. Magazine, PageFlipEngine y navegación

- `Magazine` (`src/components/Magazine.tsx`) gestiona lectura, navegación, miniaturas y estado actual; monta `ProductModal` y `CartDrawer`. Resuelve la navegación (`resolveNavigation`), expone el indicador `data-testid="page-indicator"` (`1 / 39` en tapa/portrait, `37–38 / 39` en spread landscape) con navegación directa por número, y comunica ocupación de UI a `CommerceContext.setUiBusy` (modal, carrito o transición en curso).
- `PageFlipEngine` (`src/components/PageFlipEngine.tsx`) adapta StPageFlip (`page-flip` 2.0.7) a React. `PdfPage` renderiza la imagen y sus estados de carga.
- `bookFlow.ts`: P39 es exclusivamente la contratapa física y nunca forma parte del array de StPageFlip (solo P1–P38 alimentan el book); tras P14 (índice de colección) se inserta una página virtual de video (`collection-2027-video`, `COLLECTION_VIDEO_SRC = "/videos/news.mp4"`). Incluye helpers de paridad landscape/portrait (`backCoverOpenBookIndex`), etiquetas y detección del tramo StarLab (P2–P13).
- `hardCoverMotion.ts`: configuración física única compartida por portada y contratapa (`HARD_COVER_FLIP_MS = 950`, `showCover: true`, `swipeDistance: 28`, `maxShadowOpacity: 0.52`; con `prefers-reduced-motion` el giro baja a 180 ms).
- Carrusel P14: `Page14Coverflow.tsx` (Swiper 14) muestra las palas como abanico/coverflow navegable que abre el modal del producto activo.
- Video: `VideoPage.tsx` reproduce `/videos/news.mp4` solo cuando está visible (`visible` + `playbackAllowed`), enmudecido (`defaultMuted`, autoplay con sonido desactivado por política de navegador) y con pausa automática al salir de vista; el e2e `video-reveal` cubre la sincronización video/carrusel/navegación.

### Por qué está implementado así

La contratapa fuera del book y la configuración compartida de tapas resuelven bugs reales de paridad y orientación (commits “Implementacion BackOver”, “preservar espejo exterior en producción”, “sincronizar video, carrusel y setup de navegación”): en landscape el engine informa la hoja izquierda del spread, por eso existe el ajuste `lastBookIndex - 1`. **Motivo no determinable**: los valores exactos (950 ms, 180 ms reduced-motion, `swipeDistance: 28`, `maxShadowOpacity: 0.52`) no tienen justificación escrita; constan como constantes calibradas visualmente.

## 6. Hotspots

- `HotspotLayer` dibuja zonas porcentuales escalables sobre cada página. Las coordenadas viven en `src/data/CatalogData.ts` y asocian `productId` del Excel con `pageId` física; no hay lógica comercial por categoría.
- Cobertura: palas P15–P26 (plantilla común), paleteros P28–P33, mochilas P34–P36, neceseres P37 (dos hotspots), accesorios P38 (retícula de 9). P27 es overview sin hotspots; P39 contratapa sin hotspots.
- `selectLiveHotspots` conserva un hotspot si su `productId` existe en el catálogo generado, incluso con `disponible=false` (el modal lo muestra “Sin stock”). Eliminar la fila del Excel desactiva el hotspot sin tocar código. Pulsar un hotspot abre `ProductModal` sin cambiar de página; al cerrarlo se conserva spread y posición (cubierto por e2e `catalog.spec.ts`).
- `products` en `CatalogData.ts` es legado editorial del piloto (Raptor+), conservado por compatibilidad con el test histórico; la fuente comercial vigente es el catálogo generado.

### Por qué está implementado así

La geometría es manual porque las coordenadas sobre imágenes editoriales no pueden inferirse: el propio archivo lo declara (“coordenadas manuales que NO pueden inventarse”). El filtro categoría-agnóstico evita ramas por tipo de producto: dar de alta cualquier categoría es agregar fila + entrada con `productId`/`pageId`/coordenadas.

## 7. ProductModal, galería y carrito visual

- `ProductModal`: overlay oscuro, cierre superior, galería (`imagenes` del producto, con `ProductImage`/`ProductGalleryImage` y variantes en `productImageVariants.json`), nombre, precio de exhibición, cantidad y acción de carrito. El precio mostrado es informativo; el cargo lo determina el backend.
- `CartDrawer.tsx` es el drawer del carrito con banner de avisos de reconciliación y toast resumido.

## 8. Catálogo comercial: Excel → JSON

- Fuente vigente: `catalog/products.xlsx`, hoja `Productos`, encabezados requeridos en `scripts/lib/products-model.mjs` (`REQUIRED_HEADERS`; `ean` e `imagenN` opcionales). Sin stock numérico ni bandera activo/inactivo: si el producto está en el Excel forma parte del catálogo; para retirarlo se elimina la fila.
- `node scripts/import-products.mjs catalog/products.xlsx` regenera `generated/products.json` + `generated/products-version.json` y copia a `public/` (reproducible: sin timestamps; la versión es `sha256-…` de los bytes exactos). `--check` valida sin escribir (falla si `generated/` está desactualizado); `--check-images` opcional. El importador además valida que las rutas de imagen no escapen `public/products/` (contención física por `path.resolve`, no solo regex).
- `CommerceContext` carga `products.json` publicado y valida con `isValidCatalog` (`schemaVersion: 1`); el manifiesto se valida con `isValidVersionManifest` (`sha256-[a-f0-9]{64}`, `productsFile: "products.json"`).
- Alta de producto: agregar fila en el Excel y, si necesita hotspot, entrada en `CatalogData.ts`. Semilla piloto: `npm run products:seed`.
- En dev, `publishedCommercePlugin` (`vite.config.ts`) sirve `products.json`/`products-version.json` desde `generated/` sin caché; en build los emite en `dist`.

### Por qué está implementado así

El hash de bytes exactos como versión hace que el polling pueda comparar una cadena corta en vez de descargar el catálogo completo en cada pasada. La validación estricta de esquema (`schemaVersion: 1`, producto con `id/sku/nombre/precio/disponible/imagenes`) hace que un catálogo corrupto falle cerrado con mensaje en vez de vender con datos parciales.

## 9. Carrito

- `cart.ts` (puro, sin React): guarda solo `productId` + `qty` (`starvie-cart-v1`), sin tope de inventario (mínimo 1; `qty <= 0` elimina la línea). Precio y disponibilidad nunca se leen de `localStorage`: siempre del catálogo en memoria.
- `presentLines` enriquece con producto vigente y subtotal actual; `reconcileLines` ante catálogo nuevo retira inexistentes (`removed`) o no disponibles (`out-of-stock`) con aviso, y aplica el precio nuevo en silencio.
- `CommerceContext` hidrata, persiste y reconcilia; expone `addToCart` (bloquea no disponibles con toast), `setQty`, `removeFromCart`, `clearCart`, banner `cartNotices` + toast de 3,2 s. El checkout vacía el carrito solo cuando el pedido llega a `completed`; en `processing`/`unknown`/`failed` lo conserva.

### Por qué está implementado así

Guardar solo identidad + cantidad y reconciliar contra el catálogo vigente impide comprar con precios viejos guardados: el comentario en el código lo declara (“El precio y la disponibilidad NUNCA se leen de localStorage”). Que los cambios de precio sean silenciosos y solo la disponibilidad genere avisos es una decisión de UX registrada en el código; **motivo no determinable**: no hay documento que explique por qué el precio no avisa.

## 10. Checkout, orderAttempt e idempotencia

- `CheckoutModal.tsx` pide contacto obligatorio (nombre, razón social, email válido) y opcionales (teléfono, provincia, ciudad, dirección, CUIT de 11 dígitos, notas hasta 500 caracteres). Validación en `validateContact` (`orders.ts`).
- `buildOrderPayload` construye `{ contact, lines, idempotencyKey }` solo con líneas presentadas (existen y `disponible=true`, enteras ≥ 1), sin precios. `newIdempotencyKey` usa `crypto.randomUUID` y lanza si no está disponible (sin fallback inseguro).
- `submitOrder(payload, { turnstileToken? })` con timeout 15 s (`ORDERS_TIMEOUT_MS`): clasifica `completed` (200/201 + `completed`), `processing` (201 `accepted`, 200/201 `processing`, o 202 siempre), `failed` (502 con `status="failed"` y `orderId` no vacío), `conflict` (409), `rateLimited` (429 + `Retry-After` en segundos o fecha HTTP, acotado a 24 h), `validation` (400/401/403), `verificationRequired` (el Worker indica que falta token: reintentar mismo payload y key con token fresco), `unknown` (red/timeout/502 incompleto u otros 5xx ambiguos). Ante 2xx malformadas, falla cerrado.
- `VITE_API_BASE_URL` solo existe para desarrollo (apunta al harness local); en producción el modal usa `submitOrder` por defecto contra `https://api.real-step.com.ar` (`resolveApiBaseUrl` cae a `ORDERS_PRODUCTION_API`).

### Por qué está implementado así

Todo el diseño es “fallar cerrado”: 2xx sin `orderId` válido, 502 incompleto y timeouts se clasifican `unknown` (incierto, conservar intento) en vez de asumir éxito o fracaso. El caso `verificationRequired` existe porque el Worker consulta el pedido idempotente existente antes de verificar Turnstile: tras un timeout se re-consulta sin token para recuperar un pedido ya creado antes de pedir un token nuevo. No hay `Math.random` como fallback de UUID por seguridad. **Motivo no determinable**: los valores 15 s de timeout, 500 caracteres de notas y 11 dígitos de CUIT (este último es formato fiscal argentino estándar, pero su elección como única validación no está documentada).

## 11. Persistencia y recuperación de pedidos (`orderAttempt.ts`, marcador v2, sin PII)

- `localStorage` (`starvie-order-attempt-v2`): `{ version, idempotencyKey, orderId?, lines, createdAt, completedAt?, status? }`. Sin contacto ni fingerprint.
- `sessionStorage` (`starvie-order-attempt-v2-session`): `OrderPayload` completo + snapshot de líneas + ancla `createdAt`, solo misma pestaña.
- `prepareAttempt` es el gate atómico previo al POST: con marcador válido solo permite reuso exacto (misma key + líneas + contacto); sin marcador escribe sesión + marcador con rollback; si está corrupto o expirado, falla cerrado sin recrear automáticamente.
- Retención ≤ 23 h desde `createdAt` para recuperar intentos pendientes o inciertos; el vencimiento no los borra. Nunca hay auto-envío ni auto-reintento. `completed` (201 nuevo o 200 duplicado) cierra marcador y sesión comprobando la key; el número sigue visible en la confirmación. Un marcador histórico `completed` se resuelve al abrir incluso vencido, sin vaciar el carrito actual. Los demás estados terminales exigen resolución explícita; si el estado está bloqueado, la UI exige confirmar que se consultó a StarVie. Doble clic prevenido con guard sincrónico (`ref`).

### Por qué está implementado así

La doble persistencia separa lo mostrable entre pestañas (marcador mínimo sin PII, coordinador ante doble submit) de lo reintentable en la misma pestaña (payload completo con contacto). No guardar contacto en `localStorage` es una decisión de privacidad explícita. **Motivo no determinable**: la ventana de 23 h (en vez de 24 h) no tiene justificación escrita.

## 12. Turnstile

- Estado: activado en frontend y backend en producción. `TurnstileWidget.tsx`: carga `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, render explícito con acción `order_starvie`, tamaño `normal`/`compact` según viewport (< 380 px compacto), callbacks de token/expiración/error y `resetSignal`.
- Semántica real del flag (ver `TurnstileWidget.tsx`): `turnstileEnabled()` es `VITE_TURNSTILE_ENABLED !== "false"` (activado por defecto; solo `"false"` lo desactiva) y `turnstileSiteKey()` devuelve `null` si el flag es `"false"` o si no hay sitekey. Si falta sitekey con la protección activada, el checkout bloquea nuevos envíos.
- El token viaja solo en el POST que lo obtiene; nunca se guarda en storage.
- No colocar el secret en variables `VITE_` ni en el frontend: la verificación y el secret pertenecen al Worker.

## 13. Integración con realstep-api

- `POST /api/orders` con `{ catalogId: "starvie", contact, lines, idempotencyKey, turnstileToken? }`. Constantes en `orders.ts`: `ORDERS_ENDPOINT = "/api/orders"`, `ORDERS_CATALOG_ID = "starvie"`, `ORDERS_PRODUCTION_API = "https://api.real-step.com.ar"`.
- Idempotencia: misma key + mismo payload recupera el pedido existente (200/202); misma key + distinto payload devuelve 409. Tras un timeout, el checkout re-consulta primero con el mismo payload y key sin token para recuperar un pedido ya creado antes de pedir un token nuevo.
- El backend recalcula precio/disponibilidad, aplica rate limiting y envía correos (internos + confirmación al cliente) vía Resend. Detalle del harness y resultados en `docs/local-checkout-integration.md`.
- `createMockSubmitOrder` es un stub solo para desarrollo/tests; nunca se usa en producción.

## 14. Polling y versionado

- Comercio (`polling.ts`, `COMMERCE_POLL_INTERVAL_MS = 60_000`): señal liviana sobre `products-version.json` con cache-busting; el catálogo completo solo se descarga si la versión cambió (`createCatalogChecker`: `current`/`updated`/`unavailable`/`invalid`).
- App (`APP_POLL_INTERVAL_MS = 60_000`): `createAppChecker` compara `app-version.json` con la versión cargada (`__STARVIE_APP_VERSION__` o meta `starvie-app-version`); si cambió y es seguro recargar (modal y carrito cerrados vía `busyRef`), recarga automáticamente; si no es seguro, difiere. `APP_RELOAD_STORAGE_KEY` evita loops de recarga y `?check=<timestamp>` + `no-store` evitan caché.
- `startPolling` es consciente de visibilidad: no chequea con pestaña oculta; re-chequea en `visibilitychange` y `focus`.
- `appVersionPlugin` (`vite.config.ts`) inyecta la meta, sirve `/app-version.json` dinámico en dev y escribe `dist/app-version.json` con SHA-256 reales por archivo.

### Por qué está implementado así

El polling en dos niveles (versión corta, descarga completa solo ante cambio) minimiza tráfico. El guard de “recarga segura” evita recargar en medio de un checkout (perdería el estado del intento). El `reload-loop-guard` en `sessionStorage` evita un ciclo infinito si una versión publicada rompe el arranque. **Motivo no determinable**: el intervalo de 60 s no tiene justificación escrita.

## 15. Variables públicas de entorno

| Variable | Uso |
| --- | --- |
| `VITE_TURNSTILE_ENABLED` | Solo `"false"` desactiva la protección; cualquier otro valor (incluido ausente) la mantiene activada. En producción: `true` (vía variables del repositorio). |
| `VITE_TURNSTILE_SITE_KEY` | Site Key pública del widget de `starvie.real-step.com.ar`. En producción: la key real. |
| `VITE_API_BASE_URL` | Solo desarrollo: anula la base de la API (p. ej. `http://127.0.0.1:8787`). No definir en producción. |

Vite las incorpora al bundle durante el build: cambiar una variable no modifica un sitio ya publicado; requiere rebuild + deploy. La clave de prueba oficial de Cloudflare (`1x00000000000000000000AA`) es solo para tests locales. Nunca usar variables `VITE_` para secretos (quedan expuestas en el bundle).

## 16. GitHub Actions, GitHub Pages y dominio

- Workflow `.github/workflows/deploy.yml`: se dispara con push a `main` y `workflow_dispatch`. Job `build` (checkout, Node 22, `npm ci`, validación de config Turnstile —falla si la protección está activada sin sitekey—, `npm run build` con `VITE_TURNSTILE_ENABLED` y `VITE_TURNSTILE_SITE_KEY` leídas de **variables** del repositorio, `true`/vacío por defecto; `configure-pages`, subida del artefacto `./dist`) y job `deploy` (environment `github-pages`, `deploy-pages`). Todo push a `main` publica automáticamente.
- El dominio propio `starvie.real-step.com.ar` apunta al sitio de Pages. No hay secretos en el workflow: la sitekey es pública y el secret de Turnstile vive en el Worker.
- Actualización del catálogo: editar `catalog/products.xlsx` → `node scripts/import-products.mjs catalog/products.xlsx` (regenera `generated/` y copia a `public/`) → `npm run check-products`. Páginas PDF: `npm run build:pdf-pages`. Imágenes: `build:coverflow-images`, `build:product-images`.
- Publicación del backend (`realstep-api`, otro repositorio): comprobar que el Worker publicado incluya secret, hostname, acción `order_starvie` y habilitación de `starvie`, sin exponer el secret; coordinar el orden frontend/backend antes de cada activación.

## 17. Tests y E2E

- `npm test` (`vitest run`; `test:watch` interactivo; config en `vite.config.ts`: jsdom, `src/test/setup.ts`, excluye `e2e/` y `dist/`): unitarios de commerce (`cart`, `catalog`, `orders`, `orderAttempt`, `polling`, `money`, `CartDrawer`, `CheckoutModal`), componentes (`ProductModal`, `ProductImage`, `ProductGalleryImage`, `VideoPage`, `Page14Coverflow`), datos (`CatalogData`, `bookFlow`, `hardCoverMotion`).
- `src/commerce/localHttp.test.tsx`: harness HTTP especial Windows ↔ WSL contra Miniflare; se ejecuta por separado con `STARVIE_LOCAL_INTEGRATION=1` (ver `docs/local-checkout-integration.md`), con `describe.skipIf(!enabled)` fuera del harness. Resultado de referencia 27-09-2026: 9/9; suites habituales 232 commerce / 293 frontend aprobadas con 9 omitidas; backend 85 aprobadas. **Esas cifras son de esa fecha; no se re-verificaron en esta revisión documental y no ejecutar tests estaba permitido.**
- `npm run test:e2e` (Playwright, proyectos `chromium-desktop` 1440×900 y `chromium-mobile` Pixel 7, base dev `http://127.0.0.1:5173` con servidor automático): 14 specs — `catalog`, `commerce`, `product-modal`, `viewer-lab`, `back-cover-orientation`, `checkout-image`, `final-visual`, `mobile-navigation`, `navigation-geometry`, `navigation-race`, `page-image-loading`, `page14-coverflow`, `product-images`, `video-reveal`. `playwright.preview.config.ts` permite correr contra `vite preview` (`http://127.0.0.1:4173`) pero no tiene script npm propio.
- `npm run check-products`: coherencia Excel ↔ generados (`--check`; `--check-images` opcional).

### Por qué está implementado así

El harness local existe porque el Worker productivo solo acepta el Origin de producción: solo un adaptador local traduce Origin/CORS para probar el frontend desde localhost sin tocar el Worker. Los tests simulan el widget de Turnstile (`window.turnstile` inyectado) para no depender del script remoto de Cloudflare.

## 18. Comportamiento mobile

- Portrait: página simple con indicador `N / 39`; landscape/desktop: spread `A–B / 39`. Proyecto Playwright `chromium-mobile` (Pixel 7) + specs `mobile-navigation`.
- Sin flechas laterales en mobile; drawer de miniaturas en franja estrecha; header comprimido (la referencia de fase 1 documenta el comportamiento esperado).
- Turnstile compacto bajo 380 px de ancho; `touch-action: pan-y` y tap-highlight desactivado en CSS; video enmudecido con autoplay permitido.

## 19. Estados de error (troubleshooting)

| Síntoma | Causa probable / acción |
| --- | --- |
| Checkout bloquea envíos | Protección activa sin sitekey (`VITE_TURNSTILE_ENABLED=true` sin `VITE_TURNSTILE_SITE_KEY`): definir la key y rebuild. |
| `verificationRequired` tras timeout | Flujo previsto, no error: reintentar mismo payload y key con token fresco. |
| 409 en reintento | La key se reusó con distinto payload: revisar `orderAttempt`, no mutar carrito/contacto del intento. |
| 429 | Rate limiting: respetar `Retry-After` y reintentar después. |
| 502 con `status="failed"` y `orderId` | Fallo terminal confirmado: conservar la referencia y resolver el intento antes de otra compra. |
| 502 incompleto o sin estado concluyente | Incierto: conservar el intento persistido y recuperarlo con mismo payload y key dentro de la ventana de idempotencia. |
| Catálogo vacío o inválido | `products.json` con `schemaVersion` distinto de 1 o producto malformado: regenerar con `import-products` + `check-products`. |
| Página en blanco “No se pudo cargar el catálogo” | Falta `public/catalog/catalog.json`: ejecutar `build:pdf-pages`. |
| Cambios de variables sin efecto | Compiladas en el bundle: rebuild + nuevo deploy. |
| CORS 403 en local | Esperable sin el adaptador del harness; usar el harness documentado. |

## 20. Limitaciones actuales y trabajo no implementado

- El frontend es estático (sin SSR); el catálogo de páginas requiere rebuild del pipeline PDF ante cambios del PDF; el polling es cada 60 s y respeta pestaña oculta; la recuperación de intentos expira a las 23 h y exige reingreso manual si se pierde la sesión; los precios del frontend son informativos.
- No implementado (no presentar como hecho): notificaciones visibles de actualización de app/catálogo, observabilidad del checkout, ampliación del laboratorio viewer-lab (`PadelViewerLab` + `explorer/` son laboratorio interno, no parte del flujo comercial), optimización adicional de imágenes. Cualquier mejora requiere autorización y debe preservar catálogo, navegación, hotspots, carrito y checkout.
- Documentos históricos conservados: `docs/phase-1-notes.md` (investigación de la referencia y del PDF), `docs/viewer-lab-report.md` (evolución del laboratorio, 2026-09-11), `docs/catalog-visual-quality.md` (decisión de resolución), `docs/local-checkout-integration.md` (harness y prueba real). Son registro, no guía operativa: ante contradicción con el código, vale el código.

## 21. Seguridad y separación frontend/backend

- El frontend no guarda secretos: la sitekey de Turnstile es pública; el secret y la verificación viven en el Worker.
- Sin PII en `localStorage` (solo key, líneas e IDs); el contacto completo solo existe en `sessionStorage` de la misma pestaña.
- Sin auto-envíos ni auto-reintentos: cada POST nace de una acción explícita del usuario tras `prepareAttempt`.
- No enviar pedidos reales ni correos durante las pruebas. No consultar ni mostrar secretos.
