# StarVie 2027 · catálogo digital interactivo

Catálogo digital interactivo de la colección StarVie 2027. Conserva cada página del PDF oficial como imagen y superpone navegación tipo revista, hotspots de producto, ficha modal, carrito y checkout integrado con `realstep-api`.

- Frontend en producción: https://starvie.real-step.com.ar
- Backend (API de pedidos): https://api.real-step.com.ar
- Estado: publicado y verificado con una prueba real de extremo a extremo (pedido procesado, correos internos y confirmación al cliente recibidos).

## Tecnologías

- React 19 + TypeScript + Vite 8.
- `page-flip` (StPageFlip) para el efecto revista (`PageFlipEngine`).
- Vitest + Testing Library + jsdom (tests unitarios), Playwright (e2e).
- `exceljs` + `sharp` en scripts (importación de productos, pipeline PDF).
- GitHub Actions + GitHub Pages para publicación del frontend.
- Cloudflare Turnstile (acción `order_starvie`) como verificación anti-bots del checkout.

## Arquitectura resumida

- `src/App.tsx`: decide entre catálogo (`CatalogApp` + `CommerceProvider` + `Magazine`) y laboratorio (`PadelViewerLab` vía ruta `/viewer-lab` o `?viewer-lab`).
- `src/components/Magazine.tsx`: lectura, navegación, miniaturas y estado actual; monta `ProductModal` y `CartDrawer`.
- `src/components/PageFlipEngine.tsx`: adaptador React de StPageFlip. `PdfPage.tsx`: imagen y estados de carga. `HotspotLayer.tsx`: zonas porcentuales escalables.
- `src/components/ProductModal.tsx`: ficha superpuesta sin cambiar de página.
- `src/commerce/`: `CommerceContext.tsx` (carrito + catálogo publicado), `cart.ts`, `catalog.ts` (carga/validación de `products.json`), `orders.ts` (payload y `submitOrder`), `orderAttempt.ts` (persistencia del intento), `polling.ts` (versionado), `CheckoutModal.tsx`, `CartDrawer.tsx`, `TurnstileWidget.tsx`.
- `src/data/CatalogData.ts`: geometría manual de hotspots (coordenadas % por `productId`); la fuente comercial vigente es el catálogo generado.
- Backend externo `realstep-api` (fuera de este repositorio): `POST /api/orders` con `catalogId: "starvie"`, idempotencia por `idempotencyKey`, verificación Turnstile y envío de correos.

## Scripts existentes (`package.json`)

| Script | Comando |
| --- | --- |
| `dev` | `vite --host 0.0.0.0 --port 5173` |
| `build` | `tsc -b && vite build` |
| `build:pdf-pages` | `node scripts/build-pdf-pages.mjs` |
| `products:seed` | `node scripts/seed-pilot-xlsx.mjs` |
| `import-products` | `node scripts/import-products.mjs catalog/products.xlsx` |
| `check-products` | `node scripts/import-products.mjs catalog/products.xlsx --check` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `playwright test` |

## Estructura de carpetas

- `src/`: `App.tsx`, `main.tsx`, `styles.css`, `commerce/`, `components/`, `data/`, `types/`, `test/`.
- `catalog/products.xlsx`: fuente comercial editable. `catalog/products.pilot.json`: piloto histórico.
- `generated/products.json`, `generated/products-version.json`: catálogo generado y su versión (`sha256-…`).
- `public/products.json`, `public/products-version.json`: copias publicadas; `public/catalog/` (páginas, miniaturas, `catalog.json`); `public/checkout/`, `public/viewer-lab/`, `public/products/`.
- `scripts/`: `build-pdf-pages.mjs`, `import-products.mjs`, `seed-pilot-xlsx.mjs`, `lib/`.
- `e2e/`: `catalog.spec.ts`, `commerce.spec.ts`, `product-modal.spec.ts`, `viewer-lab.spec.ts`.
- `docs/`, `.github/workflows/deploy.yml`, `index.html`, `vite.config.ts`.

## Documentación disponible

- [docs/PRODUCCION.md](docs/PRODUCCION.md): guía técnica y operativa completa (arquitectura, checkout, Turnstile, publicación, troubleshooting).
- [docs/local-checkout-integration.md](docs/local-checkout-integration.md): integración local frontend/backend, harness HTTP y diferencias con producción.
- [docs/phase-1-notes.md](docs/phase-1-notes.md): investigación y decisiones de fase 1.
- [docs/catalog-visual-quality.md](docs/catalog-visual-quality.md), [docs/viewer-lab-report.md](docs/viewer-lab-report.md): calidad visual y laboratorio.

## Desarrollo y validación (resumen)

```bash
npm install
npm run build:pdf-pages   # requiere Poppler (pdftoppm, pdfinfo)
npm run dev               # http://localhost:5173
```

```bash
npm test          # unitarios (Vitest)
npm run test:e2e  # extremo a extremo (Playwright)
npm run build     # tsc + build de producción
git diff --check  # higiene antes de publicar
```

La suite `src/commerce/localHttp.test.tsx` requiere el harness HTTP local descrito en [docs/local-checkout-integration.md](docs/local-checkout-integration.md) y se ejecuta por separado con `STARVIE_LOCAL_INTEGRATION=1`. No enviar pedidos reales durante las pruebas. Un push a `main` publica automáticamente en GitHub Pages: solo publicar con autorización explícita.

## Producción

Ver [docs/PRODUCCION.md](docs/PRODUCCION.md): dominios, variables públicas (`VITE_TURNSTILE_ENABLED`, `VITE_TURNSTILE_SITE_KEY`, `VITE_API_BASE_URL` solo desarrollo), GitHub Actions/Pages, actualización del catálogo, verificaciones post-deploy y limitaciones actuales.
