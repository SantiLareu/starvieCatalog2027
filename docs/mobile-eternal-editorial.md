# Editorial Eternal en mobile portrait

La página virtual existente `sanyo-2027-editorial` (`SANYO`) se presenta antes de
la ficha original P29 sólo bajo el query portrait actual: ancho hasta 599 px y
orientación portrait. No se agrega ninguna hoja ni se renumera el PDF.

Orden físico portrait: P27 (índice), P28 (Hard Eva Black), SANYO (introducción),
P29 (Hard Eva Eternal), TAMARA (introducción T-One Pro), P30 y el resto del book. SANYO ocupa el índice
29 desde cero y P29 ocupa el 30. Desktop/landscape conservan P29 | SANYO y el
orden original. `mobilePortraitBookPages` proyecta una copia sin mutar ese orden.

La card Eternal del índice dirige a la introducción. Next/swipe lleva a P29;
Previous desde P29 vuelve a la introducción y Previous desde ella vuelve al
índice P27 con la transición física de sección ya existente. T-One Pro aplica
el mismo contrato con TAMARA/P30; las otras cards,
el selector de páginas PDF, ProductModal y comercio conservan sus destinos.

## Arte real reutilizado

Fuente: `references/banners/Banner Sanyo home.png`, master oficial de 2561×740.
No se encontraron elementos fuente separados. Se extrajeron regiones completas
del master, sin generar, redibujar o reconstruir al jugador/producto/firma:

- `public/mobile/eternal-sanyo-portrait.webp`: Sanyo con el bolso. Rectángulo
  x=1560, y=90, ancho=405, alto=580; WebP calidad 92.
- `public/mobile/eternal-sanyo-signature.webp`: firma original. Rectángulo
  x=1125, y=495, ancho=275, alto=108; WebP calidad 94.

`MobileEternalEditorial` delega en la plantilla compartida `MobileAccessoryEditorial`,
que recompone los títulos en HTML y muestra ambos recortes
con `object-fit: contain`. Papel cálido y dorado siguen el arte oficial, sin
reutilizar la composición horizontal como una imagen aplastada. No hay datos
técnicos, precios, CTA ni identidad de producto interactiva. No se agregan
animaciones, filtros ni dependencias. Los recortes cargan sólo al acercarse y
permanecen disponibles durante los giros/copias nativas.

Al rotar, el engine se monta con el mismo ID de página en el orden correspondiente.
Se ignoran los índices de resize emitidos por el visor que se está retirando y
se cancela su transición pendiente para evitar bloquear los controles.
