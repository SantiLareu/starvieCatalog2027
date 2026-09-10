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
