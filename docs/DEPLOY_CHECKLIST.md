# Checklist pre/post publicación — StarVie 2027

Guía operativa para abrir antes de cada publicación. Solo contiene validaciones que EXISTEN en el repositorio (`package.json`, workflows, scripts, tests). Lo que no existe se marca explícitamente como **NO EXISTE ACTUALMENTE** con propuesta por separado, sin agregarlo.

Regla de oro: un push a `main` publica automáticamente en GitHub Pages. Solo publicar con autorización explícita.

## Cuándo NO ejecutar pruebas con pedidos reales

- NUNCA enviar pedidos reales durante las pruebas, salvo autorización explícita para una prueba real coordinada (la última se documenta en `docs/local-checkout-integration.md`; no repetir sin autorización).
- `npm test` y `npm run test:e2e` son seguros: usan mocks, fixtures y `window.turnstile` simulado; no tocan la API publicada.
- `src/commerce/localHttp.test.tsx` (harness con `STARVIE_LOCAL_INTEGRATION=1`) es seguro porque apunta al Worker local en Miniflare (`127.0.0.1:8787`) con Resend y Siteverify simulados. Solo se vuelve peligroso si alguien fija `VITE_API_BASE_URL` a la API de producción: verificar la variable antes de arrancar.
- Tras el deploy, verificar el widget de Turnstile visualmente en el checkout SIN completar un pedido real.

## 1. Cambios UI / CSS (estilos, layout, textos)

| Comando | Qué comprueba | Obligatorio |
| --- | --- | --- |
| `npm test` | Toda la suite unitaria (componentes incluidos) | Sí |
| `npm run build` | `tsc -b` + build de producción sin errores | Sí |
| `git diff --check` | Sin marcadores de conflicto ni espacios finales | Sí |
| `npm run test:e2e` | Flujos visuales en desktop + mobile | Recomendado si el cambio es visible |

## 2. Navegación / PageFlip / tapas / video / carrusel

| Comando | Qué comprueba | Obligatorio |
| --- | --- | --- |
| `npm test` | `bookFlow`, `hardCoverMotion`, `CatalogData`, `VideoPage`, `Page14Coverflow` | Sí |
| `npm run test:e2e` | `catalog`, `navigation-geometry`, `navigation-race`, `back-cover-orientation`, `final-visual`, `page-image-loading`, `mobile-navigation`, `page14-coverflow`, `video-reveal` | Sí |
| `npm run build` | El bundle compila con los cambios del engine | Sí |
| `git diff --check` | Higiene del diff | Sí |

Si se regeneraron páginas del PDF: además `npm run build:pdf-pages` (requiere Poppler `pdftoppm`/`pdfinfo`) y verificar `public/catalog/catalog.json` + una `page-*.webp`.

## 3. Catálogo / productos (Excel, hotspots, imágenes)

| Comando | Qué comprueba | Obligatorio |
| --- | --- | --- |
| `node scripts/import-products.mjs catalog/products.xlsx` | Regenera `generated/` y copia a `public/`; valida encabezados, filas e imágenes dentro de `public/products/` | Sí (tras editar el Excel) |
| `npm run check-products` | `generated/` está actualizado respecto al Excel (`--check`); falla si no | Sí |
| `npm test` | `catalog`, `CartDrawer`, `CheckoutModal`, `ProductModal`, `CatalogData` contra el catálogo vigente | Sí |
| `npm run test:e2e` | `commerce`, `product-modal`, `product-images` | Recomendado |
| `npm run build:product-images` | Solo si cambiaron imágenes de producto | Condicional |
| `npm run build:coverflow-images` | Solo si cambió el carrusel P14 | Condicional |

Alta de producto con hotspot: agregar fila en el Excel Y entrada (`productId` + `pageId` + coordenadas) en `src/data/CatalogData.ts`. Si el producto se elimina del Excel, su hotspot se desactiva solo.

## 4. Carrito / checkout / Turnstile / pedidos

| Comando | Qué comprueba | Obligatorio |
| --- | --- | --- |
| `npm test` | `cart`, `orders`, `orderAttempt`, `polling`, `CartDrawer`, `CheckoutModal` (idempotencia, clasificación 200/201/202/409/429/502, `verificationRequired`, persistencia v2) | Sí |
| Harness local (ver `docs/local-checkout-integration.md`): en WSL `node test/local-http.mjs` (desde `realstep-api`) + en Windows `STARVIE_LOCAL_INTEGRATION=1 npm test -- src/commerce/localHttp.test.tsx` | Integración HTTP real contra Miniflare, 9 casos | Solo si cambió `orders.ts`, `orderAttempt.ts`, `CheckoutModal.tsx` o el contrato con el Worker |
| `npm run test:e2e` | `commerce`, `checkout-image`, `product-modal` | Recomendado |
| Deploy de `realstep-api` | Secret, hostname, acción `order_starvie`, habilitación de `starvie` (otro repositorio; coordinar orden frontend/backend) | Solo si cambió la verificación o el contrato |

NO enviar pedidos reales para validar: el harness local + los unitarios cubren el contrato. La verificación post-deploy del checkout es visual y sin completar el pedido.

## 5. Infraestructura / configuración (workflow, `vite.config.ts`, env vars, dominio)

| Comando / acción | Qué comprueba | Obligatorio |
| --- | --- | --- |
| `npm run build` | Compila con las variables efectivas | Sí |
| Revisar variables del repositorio (`VITE_TURNSTILE_ENABLED`, `VITE_TURNSTILE_SITE_KEY`) | El workflow las lee de **variables**, `true`/vacío por defecto; sin sitekey y protección activa, el build falla a propósito | Sí |
| Recordar: las `VITE_*` se compilan en el bundle | Cambiar una variable exige rebuild + deploy; no afecta al sitio ya publicado | Siempre |
| `git diff --check` | Higiene | Sí |

## 6. Release completo (cualquier cambio que va a `main`)

1. `npm test` — verde.
2. `npm run test:e2e` — verde (levanta dev automáticamente; base `http://127.0.0.1:5173`).
3. Si tocó productos: `npm run check-products` — verde.
4. `npm run build` — verde.
5. `git diff --check` — limpio.
6. Confirmar variables de Actions y autorización explícita para el push.
7. Push a `main` (o `workflow_dispatch`) y seguir la pestaña Actions.

## Checklist final pre-deploy

- [ ] Tests unitarios verdes (`npm test`).
- [ ] E2E verde si el cambio toca UI, navegación, comercio o checkout (`npm run test:e2e`).
- [ ] `npm run check-products` verde si cambió el Excel o `generated/`/`public/products.json`.
- [ ] `npm run build` verde.
- [ ] `git diff --check` limpio; sin secretos ni credenciales en el diff.
- [ ] Variables de Actions confirmadas (`VITE_TURNSTILE_ENABLED`, `VITE_TURNSTILE_SITE_KEY`).
- [ ] Backend coordinado si cambió el contrato o Turnstile (repo `realstep-api`).
- [ ] Autorización explícita para publicar obtenida.

## Checklist post-deploy

- [ ] Actions en verde (jobs `build` + `deploy`).
- [ ] Abrir https://starvie.real-step.com.ar: portada, navegación, miniaturas, un hotspot y su modal.
- [ ] Comprobar publicados: `/products.json`, `/products-version.json`, `/app-version.json`, `/catalog/catalog.json` y una página `page-*.webp`.
- [ ] Confirmar en el bundle la versión de app y que el widget de Turnstile renderiza en el checkout (SIN enviar pedidos reales).

## NO EXISTE ACTUALMENTE (propuestas, sin implementar)

- Script de lint/format (`eslint`/`prettier` no están en `package.json`): proponer `lint` + `format:check` si se quiere higiene automática.
- Script de typecheck aislado (hoy solo vía `npm run build` con `tsc -b`): proponer `typecheck` para fallar rápido sin empaquetar.
- `check-products` en CI: el workflow solo hace `npm ci` + `build`; un Excel desactualizado respecto a `generated/` no falla el deploy. Proponer paso `npm run check-products`.
- E2E en CI: Playwright solo corre en local. Proponer job manual (`workflow_dispatch`) con `test:e2e`.
- Script npm para preview de producción: `playwright.preview.config.ts` existe pero sin script; el comando sería `npm run build` + servidor preview + `npx playwright test -c playwright.preview.config.ts`. Proponer `test:e2e:preview`.
- Comando único pre-deploy (p. ej. `predeploy` que encadene test + check-products + build + diff-check): hoy hay que correr cada comando por separado.
