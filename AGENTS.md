# AGENTS.md — Instrucciones para agentes de IA (StarVie 2027)

## Contexto del proyecto

- StarVie 2027 es el catálogo digital interactivo de la colección StarVie 2027: páginas del PDF como imágenes, navegación tipo revista, hotspots, ficha de producto, carrito y checkout con pedidos reales.
- Stack: React 19 + TypeScript + Vite 8, StPageFlip (`PageFlipEngine`), Vitest + Playwright, GitHub Pages. Detalles en `README.md` y `docs/PRODUCCION.md`.
- Arquitectura: `src/App.tsx` → `CommerceProvider` + `Magazine` (navegación, `ProductModal`, `CartDrawer`); `src/commerce/` (carrito, catálogo publicado, `orders.ts`, `orderAttempt.ts`, `polling.ts`, `CheckoutModal.tsx`, `TurnstileWidget.tsx`); `src/data/CatalogData.ts` (geometría de hotspots); backend externo `realstep-api` (`POST https://api.real-step.com.ar/api/orders`, `catalogId: "starvie"`).
- Producción: frontend https://starvie.real-step.com.ar, API https://api.real-step.com.ar, Turnstile activo en ambos lados (acción `order_starvie`).
- Archivos relevantes: `src/commerce/*`, `src/components/Magazine.tsx`, `HotspotLayer.tsx`, `ProductModal.tsx`, `src/data/CatalogData.ts`, `catalog/products.xlsx`, `generated/`, `scripts/import-products.mjs`, `vite.config.ts`, `.github/workflows/deploy.yml`.

## Reglas de trabajo

- Preservar el comportamiento existente del catálogo, navegación, hotspots, carrito y checkout. No rediseñar ni tocar PageFlip/hotspots sin autorización.
- No modificar Head (`C:\catalogo_head`) ni `realstep-api` desde este repositorio (backend solo lectura salvo corrección autorizada de defecto probado).
- No introducir dependencias ni cambios arquitectónicos innecesarios. No eliminar archivos o cambios preexistentes (incluido `odd/tasks/`) sin autorización.
- No modificar secrets ni incorporar credenciales al repositorio. No usar variables `VITE_` para secretos.
- No enviar pedidos reales ni correos durante las pruebas. No consultar ni mostrar secretos.
- No hacer commit, push ni deploy sin autorización explícita. Un push a `main` publica automáticamente en GitHub Pages.
- No modificar código productivo, tests ni configuraciones cuando la tarea sea solo de documentación.

## Validación

- Scripts reales (`package.json`): `dev`, `build` (`tsc -b && vite build`), `build:pdf-pages`, `products:seed`, `import-products`, `check-products`, `test` (`vitest run`), `test:watch`, `test:e2e` (`playwright test`).
- Según el cambio: UI/flujo comercial → `npm test` relevante + `test:e2e` si corresponde; productos → `npm run check-products`; páginas PDF → `build:pdf-pages`.
- `src/commerce/localHttp.test.tsx` es el harness HTTP especial (requiere Miniflare en WSL y `STARVIE_LOCAL_INTEGRATION=1`); no forma parte de la suite habitual. Ver `docs/local-checkout-integration.md`.
- Antes de una publicación: `npm test`, `npm run build` y `git diff --check`. Tras el deploy: verificar dominio, `/products.json`, `/products-version.json`, `/app-version.json` y widget Turnstile sin pedidos reales.

## Particularidades por agente

- Muse: no ejecutar npm, instalaciones, tests, builds ni Playwright. Limitarse a lectura y modificaciones autorizadas.
- Codex: puede ejecutar validaciones locales cuando estén autorizadas.
- Pi/Gentle-AI: respetar las mismas restricciones del repositorio y los límites de la tarea.

## Seguridad

- No exponer secretos ni hardcodear credenciales.
- No modificar la integración Turnstile sin revisar frontend y backend de forma coordinada.
- No ejecutar acciones destructivas de Git (sin `--hard`, sin reescritura de historial, sin borrado de ramas).
- No generar tráfico comercial real sin autorización.
