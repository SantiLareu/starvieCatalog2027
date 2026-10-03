# AGENTS.md — Instrucciones para agentes de IA (StarVie 2027)

## Contexto del proyecto

- StarVie 2027 es el catálogo digital interactivo de la colección StarVie 2027: páginas del PDF como imágenes, navegación tipo revista, hotspots, ficha de producto, carrito y checkout con pedidos reales.
- Stack: React 19 + TypeScript + Vite 8, StPageFlip (`PageFlipEngine`), Swiper (carrusel P14), Vitest + Playwright, GitHub Pages. Guía completa en `docs/PRODUCCION.md`.
- Arquitectura: `src/App.tsx` → `CommerceProvider` + `Magazine` (navegación, `ProductModal`, `CartDrawer`); `src/commerce/` (carrito, catálogo publicado, `orders.ts`, `orderAttempt.ts`, `polling.ts`, `CheckoutModal.tsx`, `TurnstileWidget.tsx`); `src/data/CatalogData.ts` (geometría manual de hotspots) + `bookFlow.ts` (P39 fuera del book, video tras P14) + `hardCoverMotion.ts`; backend externo `realstep-api` (`POST https://api.real-step.com.ar/api/orders`, `catalogId: "starvie"`).
- Producción: frontend https://starvie.real-step.com.ar, API https://api.real-step.com.ar, Turnstile activo en ambos lados (acción `order_starvie`).
- Archivos relevantes: `src/commerce/*`, `src/components/Magazine.tsx`, `PageFlipEngine.tsx`, `HotspotLayer.tsx`, `ProductModal.tsx`, `Page14Coverflow.tsx`, `VideoPage.tsx`, `BackCover.tsx`, `src/data/CatalogData.ts`, `catalog/products.xlsx`, `generated/`, `scripts/import-products.mjs`, `vite.config.ts`, `.github/workflows/deploy.yml`.

## Invariantes (no romper)

- El frontend nunca envía precios como autoridad: solo `productId` + `qty`. El Worker recalcula.
- Carrito persiste solo identidad + cantidad (`starvie-cart-v1`); precio/disponibilidad siempre del catálogo en memoria. Cambios de precio aplican en silencio; solo la disponibilidad genera avisos.
- Hotspots categoría-agnósticos: `selectLiveHotspots` muestra el hotspot si el `productId` existe en el Excel, aunque esté `disponible=false`. Retirar = eliminar la fila, no tocar código.
- P39 (contratapa) nunca entra al array de StPageFlip; portada y contratapa comparten settings de `hardCoverMotion.ts`. En landscape el engine reporta la hoja izquierda (ajuste `lastBookIndex - 1`).
- Idempotencia: misma key + mismo payload recupera; misma key + distinto payload = 409. `newIdempotencyKey` sin fallback inseguro; respuestas 2xx malformadas y 502 incompletos son `unknown` (fallar cerrado, conservar intento).
- Token Turnstile solo viaja en el POST que lo obtiene; nunca en storage. Contacto completo solo en `sessionStorage` (misma pestaña); `localStorage` sin PII.
- `VITE_TURNSTILE_ENABLED !== "false"` significa activado (solo `"false"` desactiva). Sin sitekey con protección activa, el checkout bloquea envíos.
- Polling cada 60 s, consciente de visibilidad; recarga de app solo si es seguro (modal/carrito cerrados) con guard anti-loops.

## Reglas de trabajo

- Preservar el comportamiento existente del catálogo, navegación, hotspots, carrito y checkout. No rediseñar ni tocar PageFlip/hotspots/física de tapas sin autorización.
- No modificar `realstep-api` (repositorio separado, backend solo lectura salvo corrección autorizada de defecto probado) ni el laboratorio `viewer-lab`/`explorer/` como si fuera flujo comercial.
- No introducir dependencias ni cambios arquitectónicos innecesarios. No eliminar archivos o cambios preexistentes (incluido `odd/tasks/`) sin autorización.
- No modificar secrets ni incorporar credenciales al repositorio. No usar variables `VITE_` para secretos.
- No enviar pedidos reales ni correos durante las pruebas. No consultar ni mostrar secretos.
- No hacer commit, push ni deploy sin autorización explícita. Un push a `main` publica automáticamente en GitHub Pages.
- No modificar código productivo, tests ni configuraciones cuando la tarea sea solo de documentación.

## Validación

- Scripts reales (`package.json`): `dev`, `build` (`tsc -b && vite build`), `build:pdf-pages`, `build:coverflow-images`, `build:product-images`, `products:seed`, `import-products`, `check-products`, `test` (`vitest run`), `test:watch`, `test:e2e` (`playwright test`).
- Según el cambio: UI/flujo comercial → `npm test` relevante + `test:e2e` si corresponde; productos → `npm run check-products`; páginas PDF → `build:pdf-pages`; carrusel P14 → specs `page14-coverflow`; video → `video-reveal`; contratapa → `back-cover-orientation` + `final-visual`.
- `src/commerce/localHttp.test.tsx` es el harness HTTP especial (requiere Miniflare en WSL y `STARVIE_LOCAL_INTEGRATION=1`); no forma parte de la suite habitual y simula Turnstile. Ver `docs/local-checkout-integration.md`. `playwright.preview.config.ts` no tiene script npm propio.
- Antes de una publicación: `npm test`, `npm run build` y `git diff --check`. Tras el deploy: verificar dominio, `/products.json`, `/products-version.json`, `/app-version.json` y widget Turnstile sin pedidos reales. Guía paso a paso en `docs/DEPLOY_CHECKLIST.md`.

## Particularidades por agente

- Muse: no ejecutar npm, instalaciones, tests, builds ni Playwright. Limitarse a lectura y modificaciones autorizadas.
- Codex: puede ejecutar validaciones locales cuando estén autorizadas.
- Pi/Gentle-AI: respetar las mismas restricciones del repositorio y los límites de la tarea.

## Problemas históricos (no reintroducir)

- Contratapa con caras invertidas o bisagra rota en cierres rápidos (ver `final-visual`, `back-cover-orientation`).
- Páginas promovidas a alta resolución antes de decodificar (parpadeo): esperar decodificación.
- Desincronización video/carrusel/navegación al cambiar de página.
- Turnstile: la verificación y el secret pertenecen al Worker; el frontend solo envía el token con acción `order_starvie`. Tras timeout, re-consultar sin token antes de pedir uno fresco (`verificationRequired`).
- CORS 403 en local sin adaptador del harness es esperable, no un bug.

## Seguridad

- No exponer secretos ni hardcodear credenciales.
- No modificar la integración Turnstile sin revisar frontend y backend de forma coordinada.
- No ejecutar acciones destructivas de Git (sin `--hard`, sin reescritura de historial, sin borrado de ramas).
- No generar tráfico comercial real sin autorización.
