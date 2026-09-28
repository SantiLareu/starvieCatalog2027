# StarVie 2027 · catálogo digital

Prototipo React + TypeScript + Vite que conserva cada página del PDF StarVie como imagen y superpone navegación e interactividad web.

## Uso

```bash
npm install
npm run build:pdf-pages
npm run dev
```

El catálogo queda disponible en `http://localhost:5173`.

## Verificación

```bash
npm test
npm run test:e2e
npm run build
```

## Pipeline PDF

`npm run build:pdf-pages` localiza el PDF en `references/starvie-2027/` o, como en este proyecto, en `starvie-2027/`. Requiere Poppler (`pdftoppm` y `pdfinfo`) y acepta las variables `PDFTOPPM_PATH` y `PDFINFO_PATH` cuando los binarios no están en `PATH`.

Genera:

- `public/catalog/pages/page-01.webp` … `page-39.webp` a 1920 px, calidad WebP 84;
- `public/catalog/thumbnails/page-01.webp` … `page-39.webp` a 480 px, calidad WebP 68;
- `public/catalog/catalog.json` con dimensiones, peso y rutas de cada página.

El runtime no usa el PDF original. Carga miniaturas para páginas lejanas y promociona a alta resolución la portada, la página activa y sus vecinas.

## Arquitectura

- `Magazine`: lectura, navegación, miniaturas y estado actual.
- `PageFlipEngine`: adaptador React para StPageFlip.
- `PdfPage`: imagen original y estados de carga.
- `HotspotLayer`: zonas porcentuales escalables.
- `ProductModal`: ficha superpuesta sin navegación.
- `CatalogData`: producto y hotspot reales.

Las notas de investigación y decisiones están en [docs/phase-1-notes.md](docs/phase-1-notes.md).

## Turnstile del checkout

El checkout mantiene Turnstile desactivado por defecto. Para probarlo **solo en desarrollo**, configurá variables públicas de Vite en tu entorno local:

```dotenv
VITE_TURNSTILE_ENABLED=true
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

La sitekey del ejemplo es la clave oficial de prueba de Cloudflare. Los tests usan la misma clave y simulan el widget; no llaman a Siteverify. No coloques el secret en variables `VITE_`: la verificación y el secret pertenecen al backend. Si se activa el flag sin sitekey, el checkout bloquea nuevos envíos.

Para el build de GitHub Pages, el workflow `.github/workflows/deploy.yml` lee **variables del repositorio** (no del environment `github-pages`) en el paso `npm run build`. En GitHub, abrí **Settings → Secrets and variables → Actions → Variables** y creá `VITE_TURNSTILE_SITE_KEY` con la Site Key pública del widget de `starvie.real-step.com.ar`. Mantené `VITE_TURNSTILE_ENABLED` sin definir o con valor `false` hasta coordinar la activación del Worker; el workflow usa `false` si falta. Cuando ambos lados estén listos para publicar, cambiá esa variable a `true` antes del build del frontend previsto. Vite incorpora estos valores públicos en el bundle durante el build: cambiar una variable de GitHub no modifica un sitio ya publicado. No cargues `TURNSTILE_SECRET_STARVIE` en GitHub ni en archivos del frontend.

El widget usa la acción `order_starvie`. El token se envía solo con el POST que lo obtiene y nunca se guarda en storage. Tras un timeout, el checkout consulta primero con el mismo payload y la misma `idempotencyKey`, sin token; el Worker recupera un pedido existente antes de verificar Turnstile. Si ese pedido no llegó a crearse, el Worker responde que falta el token y el checkout pide uno nuevo para **el mismo intento**. Antes de activar producción hay que coordinar sitekey, hostname, acción, secret y habilitación de `starvie` en el Worker, y probar el flujo completo en un entorno aislado.
