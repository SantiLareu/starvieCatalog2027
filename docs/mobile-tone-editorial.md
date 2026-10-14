# T-One Pro en mobile portrait

Sólo con el query habitual `(max-width: 599px) and (orientation: portrait)`:
índice P27 → TAMARA → ficha P30. La hoja virtual existente `tamara-2027-editorial`
ocupa el índice 31 (desde cero); P30 ocupa 32. No se agrega ninguna hoja ni se
renumera el PDF. Desktop/landscape conservan exactamente P30 | TAMARA y su banner.

La card T-One Pro dirige a TAMARA. Swipe/flecha siguiente lleva a la ficha;
anterior desde la ficha vuelve a TAMARA y anterior desde TAMARA regresa al índice
con la transición física de sección existente. Los selectores de página siguen
dirigiendo a P30. Rotar conserva la identidad lógica en la proyección correspondiente.

## Assets reales

Fuente editorial: `references/banners/Bolso deportivo Starvie Pro con atleta.png`
(1672×941), mismo arte oficial que usa el banner desktop. No había fuentes separadas;
se extrajeron las siguientes regiones sin generar ni reinterpretar imágenes:

- `public/mobile/tone-tamara-portrait.webp`: x=0, y=0, 655×941; calidad WebP 92.
  Conserva a Tamara con el bolso de la foto original, sin el título horizontal.
- `public/mobile/tone-tamara-signature.webp`: x=698, y=509, 230×100; calidad 94.
  Firma real del centro del banner.

El bolso ya aparece completo en la fotografía de Tamara; no se superpone otra
foto duplicada. Contain y máscaras CSS suaves sólo funden los márgenes de los
recortes con el papel; no se reconstruye la fotografía.

Ficha: `references/mobile/PALETERO STARVIE T-ONE PRO.PT01.png`, fotografía real
con alpha, recortada únicamente por sus márgenes vacíos y convertida a sRGB/WebP
calidad 92 a 1400×893 en `public/mobile/t-one-pro.webp`. No se modifica el original.

## Sistema compartido

`MobileAccessoryEditorial` y `mobileAccessoryEditorialPresentation.ts` reutilizan
la estructura aprobada de Eternal: tipo HTML, firma y fotografía independientes,
sin CTA ni datos comerciales. Eternal conserva su composición, clases y assets.
Tamara usa exclusivamente un modificador CSS para su composición vertical en
papel cálido y acento borgoña, coherentes con el master.

`mobileAccessoryPresentation.ts` registra P30/productId `t-one pro` (SKU
`BSTONE51000`), con los datos impresos pedidos, incluido EAN `8436612942148`.
`MobileAccessoryProductPage` permanece como única plantilla de ficha. El número de
filas de características se obtiene de su perfil (cuatro para T-One; cinco en las
fichas existentes), sin alterar posiciones ni tamaños de los otros productos.

Foto, bolsa circular y EXPLORAR llevan la misma identidad original al ProductModal
existente; ninguno agrega directamente al carrito. Las cinco imágenes de su
galería comercial permanecen intactas.

Sin dependencias nuevas, filtros ni animaciones agregadas. Los recortes editoriales
cargan cerca de su hoja y se retienen durante giros nativos. Ningún cambio en
la física, configuración de StPageFlip, ProductModal o datos comerciales.
