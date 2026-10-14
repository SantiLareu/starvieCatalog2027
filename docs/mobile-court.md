# Escenario StarVie en mobile portrait

La entrada habitual `/` activa la presentación bajo `(max-width: 599px) and
(orientation: portrait)`, el mismo breakpoint de las hojas premium existentes.
`?mobile-pilot=15` (y 16–20) conserva su utilidad como acceso directo: ya no es
necesario para habilitarla. Desktop, tablet y teléfono landscape conservan sus
componentes y presentación anteriores.

## Las cuatro piezas

- **Portada:** `MobilePortraitCover`, tipografía HTML sobre la cancha, logo mural
  independiente, año y pie editorial. El PDF y su callback de carga permanecen
  disponibles para los demás formatos.
- **Carrusel P14:** conserva Swiper, productos, fan, autoplay, selección y ficha.
  Solo cambia el escenario y la composición portrait. El encabezado empieza al
  25%; el carrusel ocupa 35%–97% de la hoja y sus imágenes usan escala 1.35.
- **StarNews:** ocupa la hoja virtual de video que ya sigue a P14. No cambia el
  orden del libro ni el indicador `VIDEO`. Video, imagen y galería comparten una
  tarjeta y resumen, sin CTA ni bloques inferiores. Los botones de galería no navegan el
  libro. El video se silencia y se pausa al abandonar la hoja o durante un giro;
  su nodo y las imágenes se montan solo cuando la hoja es visible. El control
  de pausa es invisible durante la reproducción: tocar el medio pausa el video
  y muestra Play. El foco de teclado hace visible el control por accesibilidad.
- **Hero P15–P20:** usa el layout premium existente, sus tecnologías, punto dulce,
  specs, datos e identidades comerciales. Sustituye los fondos de las antiguas
  fotografías hero por la cancha y usa fotos reales de `product.imagenes` con
  escala 0.9. Las tres acciones siguen abriendo el ProductModal original. Si
  falla una foto, prueba las siguientes imágenes del mismo producto.

## Fondo reusable

`MobileCourtBackground` comparte la cancha limpia
`src/assets/desktop/padel-court-clean.webp` y el logo independiente
`starvie-wall-logo.webp`. No se generan imágenes ni se modifica desktop.
`mobile-court.css` concentra encuadre, logo, capas de contraste y composición,
todo dentro del media query portrait. Las variantes `cover`, `lineup`, `news`,
`product` y `stage` cambian posición y sombreado sin duplicar assets.

La cancha usa `cover`, normalmente `50% 50%` (`50% 44%` en el carrusel). El logo
de portada tiene ancho 70% y top 19%, con mezcla `soft-light` al 92% para dejar
ver el material/iluminación de la pared; en el carrusel top 12%; en news top 17%,
ancho 43%; en producto top 23%, ancho 57%. El stage lleva una variante más oscura
sin logo duplicado. Son capas decorativas sin eventos de puntero ni texto
accesible. Los gradientes preservan lectura; no hay blur sobre la cancha. El
header portrait usa fondo oscuro al 78% y blur de 8px limitado al header.

Se reutiliza la banda vertical responsive existente `.mobile-p17-frame` también
en portada, P14 y StarNews. El adaptador solo amplía su elegibilidad; no cambia
el algoritmo de giro, gestos, sombras ni tapas, ni crea otra instancia del
engine. Las hojas PDF restantes recuperan su formato original al asentarse.

## Cambiar StarNews sin rehacer la página

Editar `src/data/starNewsContent.ts`: cada entrada define `id`, `category`,
`title`, `description`, `thumbnail` y una de estas formas de `media`:

```ts
{ kind: "video", src: "/videos/news.mp4", poster: "catalog/thumbnails/page-01.webp" }
{ kind: "image", src: "products/palas/ETERNAL/ETERNAL1.4.webp", alt: "Eternal" }
{ kind: "gallery", images: [
  { src: "products/palas/ETERNAL/ETERNAL1.4.webp", alt: "Eternal, frontal" },
  { src: "products/palas/ETERNAL/ETERNAL1.3.webp", alt: "Eternal, detalle" },
] }
```

Se presenta únicamente el primer artículo. Para cambiar el contenido principal,
editar esa entrada o poner otra al comienzo del array. Las entradas adicionales
se conservan como contenido disponible y no generan bloques en la hoja. El `src` del
video se respeta incluso en el artículo `collection`; dejarlo vacío hereda el
video configurado del libro. Usar títulos breves y descripciones de una o dos
líneas para mantener el módulo legible en teléfonos compactos. Si falla el
video aparece un mensaje y las otras noticias siguen disponibles.

## Extender a otras palas

El modo `courtScene` es una opción de `MobilePremiumProductPage`. Para otra pala,
registrar su perfil editorial y número en `MOBILE_PREMIUM_PAGES`: el fondo y las
fotos vienen del sistema común y del catálogo comercial, sin copiar specs,
galería, precios ni handlers. Se conservan los perfiles y assets anteriores
para poder revertir el tratamiento visual.

## Validación local

`MobileStarNews.test.tsx` cubre selección de medios, configuración, ciclo del
video y uso de fotos/datos reales. `e2e/mobile-court.spec.ts` recorre la entrada
habitual, carrusel, video/galería, hero, modal, cierre/reapertura y los seis
perfiles; también verifica el retorno al PDF en landscape. Las capturas de
revisión quedan en `tmp/mobile-court` (no se publican).

Build y 59 pruebas unitarias relevantes aprobados. Los casos de carrusel,
StarNews/video, hero, pinch/pan, ficha, orientación y reapertura pasan, incluidos
los controles de regresión desktop. Las capturas de portada y P15 desktop y
landscape coinciden exactamente con las previas; los bloques de la hero
portrait mantienen sus posiciones y dimensiones normalizadas.

La prueba exploratoria `e2e/navigation-race.spec.ts` en mobile recibe P3 cuando
espera P4 tras dos gestos y una inversión de teclado. Reproduce el mismo fallo
con la copia de componentes anterior a esta iteración. No se modificó la
navegación ni la física para corregir ese caso previo.

## Archivos de esta iteración

- Nuevos componentes/CSS: `MobileCourtBackground.tsx`, `MobilePortraitCover.tsx`,
  `MobileStarNews.tsx`, `mobile-court.css` (en `src/components/mobile/`).
- Contenido: `src/data/starNewsContent.ts`.
- Integración: `src/components/Magazine.tsx`, `PageFlipEngine.tsx`, `PdfPage.tsx`,
  `Page14Coverflow.tsx`, `VideoPage.tsx` y
  `src/components/mobile/MobilePremiumProductPage.tsx`.
- Pruebas: `src/components/mobile/MobileStarNews.test.tsx`, `mobilePilot.test.tsx`,
  `e2e/mobile-court.spec.ts`, `mobile-pilot.spec.ts` y `desktop-logo-flight.spec.ts`
  (expectativa del asset compartido mobile y medición estable del vuelo).
- Documentación: este archivo y `docs/mobile-pilot.md`.

Se preservaron los cambios previos del working tree, incluidos perfiles,
assets, técnica premium y toda la implementación desktop. No se editaron
ProductModal, comercio, hotspots, datos del PDF ni configuración de producción.

## Pulido de portada, tapas y navegación portrait

- Tipografía de portada: Helvetica Neue / Segoe UI / Arial, año de peso 200,
  etiquetas 500 y marca de pie 600. Off-white `#e6e9ed`, silver `#c6cdd3` y
  secundario `#aeb8c1`; el año lleva un gradiente metálico estático y las reglas
  son plateadas. Mantiene los bloques al 42% y a 5% del borde inferior.
- `PageFlipEngine` conserva `.mobile-p17-frame` en el estado React, además de
  aplicarla antes de medir. Antes, cada cambio de clase durante el giro borraba
  la clase agregada imperativamente y recuperaba el marco horizontal: en Pixel 7
  pasaba de y=48/alto=665 a y≈290/alto=232. El bridge de portada conserva el marco
  incluso cuando usa índices internos temporales para cerrar.
- En P14, los primeros/últimos 48px permiten swipes del libro en portrait;
  el centro conserva el drag del fan y los botones mantienen su función.
- `BackCover` sincroniza el rect nativo con su contenedor en portrait, antes de
  capturar la bisagra y al redimensionar en reposo. Su rect antes quedaba calculado
  con la altura inicial de la portada, aunque P38 ya usara el marco horizontal.
  No recalcula durante el giro. Desktop conserva las dimensiones y operaciones
  originales. El texto de contratapa ocupa top 32% / bottom 24% y el logo se
  desplaza -27% dentro de esa cara; el crédito queda por encima de la guía.
- StarNews dedica el espacio a dos filas (medio y resumen), con título y texto
  más legibles. El video usa un marco 16:9 sin recortar su contenido ni ampliar
  barras negras para llenar la hoja; las fotos/galerías aprovechan la altura.
  Ya no monta botón
  “Ver video”, tarjetas relacionadas ni sus imágenes. Los assets hero y la cancha
  por producto permanecen en el sistema compartido de cancha.

Este pulido modifica `src/components/PageFlipEngine.tsx`, `BackCover.tsx`,
`src/components/mobile/MobileStarNews.tsx`, `mobile-court.css`,
`MobileStarNews.test.tsx`, `e2e/mobile-court.spec.ts`, `e2e/final-visual.spec.ts` y
este documento. La prueba de inversión de contratapa dispara la solicitud al
entrar al estado de movimiento, sin depender de cuánto tarda un comando externo.
Las pruebas nuevas muestrean cada frame de apertura/cierre, comprueban el
swipe bidireccional, el encuadre de contratapa, el control de video y una galería
configurada como contenido principal.

## Refinamiento editorial y retorno de hojas

Se mantiene la composición de `references/mobile/mobile-cover-reference.png`
con la cancha limpia existente y texto HTML independiente. No se rasterizan
textos ni se agregan fondos por producto. El logo de portada pasa de top 19% a
17%, con opacidad .84, mezcla soft-light y una máscara de líneas apenas visible
para integrarlo al muro. Se conservan familia editorial, gradiente silver del
año, pesos 200/500/600, título al 42% y pie al 5%.

La entrada dura 950ms con curva `cubic-bezier(.22,.72,.24,1)`: fade, subida de 8px
y blur inicial de 2px, con escalonado 0/90/160/220/300ms. El fill es `backwards`:
al terminar se recuperan estilos base sin filtro ni transform permanente.
Dos gradientes ligeros simulan bruma (14s) y respiración lumínica (9s), animando
solo opacity/transform. Se animan únicamente en portada lista y en reposo;
durante giros o fuera de portada no hay bucles. `prefers-reduced-motion` elimina
entrada y ambiente. Sin nuevas dependencias, imágenes ni backdrop-filter.

La contratapa elimina los fondos y sombras rectangulares de las tres superficies
heredadas, solo dentro del media query mobile. Mantiene la cancha del stage,
texto en top 32% / bottom 24%, sombra textual discreta y el logo transparente
existente (54% de ancho, top 6% de la cara) en lugar del recorte con fondo negro.
Posicionarlo por layout evita que el override global de movimiento reducido
anule su desplazamiento y lo superponga al texto.
La instancia, caras hard, bisagra y dimensiones de `BackCover` no se cambian.

Los bordes de P14 admiten un gesto de libro también sobre las flechas: un toque
sin arrastre conserva la acción Swiper y no se convierte en un toque de hoja.
El centro continúa perteneciendo al carrusel. No cambia selección ni modal.

El retorno nativo portrait empezaba en la mitad virtual izquierda, fuera del
viewport: durante la primera mitad del gesto no se veía ninguna hoja. El
adaptador mobile inicia el tramo visible en la bisagra usando `start/fold/stopMove`
de StPageFlip, tanto por swipe como por flecha/salto inverso. Conserva cálculo,
recorte, sombras, duración configurada e índices del motor. El gesto horizontal
introduce una curvatura inicial de hasta 36px que disminuye al completar el giro;
los swipes inversos menores de 48px o cancelados vuelven al estado anterior.
Desktop y otros formatos mantienen su camino original.
El retorno automático conserva también el estado nativo `flipping` (a través
del controlador), en lugar de permanecer en `user_fold`, para mantener el
contrato de coordinación con video y bloqueo de navegación. El arrastre real
conserva `user_fold` hasta su liberación.

Archivos de este refinamiento: `MobilePortraitCover.tsx`, `mobile-court.css`,
`PageFlipEngine.tsx`, `e2e/mobile-court.spec.ts`,
`e2e/mobile-court-polish.spec.ts` y este documento. Las pruebas agregadas cubren
entrada/reduced-motion, flechas y swipe central del carrusel, navegación por
ambos bordes y la presencia de una hoja físicamente recortada y rotada durante
el drag en ambos sentidos. Los casos de tapas comprueban ausencia del panel.

Validación final: build y cobertura de imágenes aprobados; 59 unitarias del
bloque mobile/video/carrusel/zoom y los 17 casos E2E de `mobile-court-polish`,
`mobile-court`, `mobile-navigation` y `video-reveal` en mobile aprobados tras
corregir el estado del retorno automático. La suite amplia verificó además
regresiones desktop de tapas, carrusel y video, y hero, galería, zoom, rotación,
carrito y apertura de checkout sin enviar pedidos. Las capturas de portada y
hero desktop/landscape coinciden con la línea base; los archivos desktop,
ProductModal, Magazine, BackCover y estilos globales no se editaron en esta
iteración. Contratapa revisada visualmente en 412×839 y 360×640, también con
movimiento reducido. `git diff --check` aprobado, incluidos archivos nuevos.
El build conserva el aviso previo de bundle mayor a 500KB. Sin commit/push/deploy.
