# Accesorios mobile portrait — P38

P38 es la última hoja de productos antes de la contratapa. No agrega páginas ni
cambia el índice. `Magazine` registra `MobileAccessoryShowcase` únicamente dentro
del mapa de contenido portrait existente; desktop y landscape conservan el PDF y
sus hotspots.

`src/data/mobileAccessoryShowcase.ts` configura categorías, orden, títulos e
imágenes editoriales. La identidad, disponibilidad y ProductModal provienen del
catálogo live. Cada imagen/nombre y botón de bolsa usa `data-product-id` y el
delegado del libro; no hay llamadas nuevas de carrito. Un producto retirado queda
deshabilitado, mientras que uno sin stock sigue siendo explorable.

La referencia `references/mobile/accesorios StarVie.png` inspira cuatro filas:
gorra y pesos; overgrips; muñequeras; protector y llaveros. Los nombres reales
**Power Balance** (pesos) y **Tacky Touch** se conservaron con autorización del
usuario: no se sustituyen por pelotas ni por una identidad comercial inventada.
El texto se renderiza en HTML y la cancha es `MobileCourtBackground`.

## Fotografías reales

Las variantes `public/mobile/accessory-*.webp` eliminan márgenes vacíos, conservan
proporciones y se optimizan a un máximo de 480×480 px, WebP calidad 90. Fuentes de
`public/products/bolsos/accesorio/`:

| Variante mobile | Fuente |
| --- | --- |
| accessory-black-cap.webp | Gorra 4.png |
| accessory-power-balance.webp | POWER BALANCE.png |
| accessory-premier-soft.webp | OVERGRIP 60 UNITS 1.png |
| accessory-tacky-touch.webp | OVERGRIP 25 UNITS 1.png |
| accessory-wristband-white.webp | Muñequera blanca 4.png |
| accessory-wristband-blue.webp | MUÑEQUERA AZUL 1.1.png |
| accessory-wristband-black.webp | Muñequera negra pack 2 2.png |
| accessory-protector-carbon.webp | protector-transparente-carbono.webp |

Desde la auditoría PNG16, los masters `Gorra 4.png`, `Muñequera blanca 4.png` y
`Muñequera negra pack 2 2.png` se conservan en
`source-assets/product-masters/products/bolsos/accesorio/`, fuera del build.
Sus derivados mobile no cambiaron; la galería utiliza los WebP aprobados de
`public/products/bolsos/accesorio/`. Ver `docs/png16-audit-2026-10-13.md`.

`public/mobile/key-ring.webp` procede de la imagen X7.png de P38 del PDF original
en `starvie-2027/`: recorte (1460, 505, 1940, 850), sobre una imagen de 2000×891 px,
escalado a 600 px de ancho y WebP calidad 92. Conserva los tres llaveros y el
soporte claro de la fotografía original. No se generó ni redibujó ningún producto.
Este asset es únicamente editorial: el modal conserva su fallback existente
porque `key ring` no tiene galería registrada en el catálogo comercial.

## Interacción y rendimiento

Se comparte `AccessoryViewport` y su pinch/pan. Las fotografías se cargan sólo
cuando `load` lo habilita. CSS aislado a `(max-width: 599px) and
(orientation: portrait)`, sin blur, filtros animados, librerías ni JS por frame.
Los iconos tienen un círculo visual de 34 px sobre una superficie táctil de
44×44 px; la fila de muñequeras tiene más altura para los nombres largos.

Pruebas: `MobileAccessoryShowcase.test.tsx` cubre identidades, categorías,
controles, retiro/sin stock y carga diferida. `mobile-accessory-showcase.spec.ts`
cubre cinco viewports portrait, ambos controles de los nueve productos, swipe en
ambos sentidos, ida/vuelta de contratapa y conservación de PDF/hotspots en
desktop/landscape. Los pedidos reales se bloquean durante E2E.
