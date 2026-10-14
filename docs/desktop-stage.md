# Escena desktop

Todos los estilos están centralizados en `src/components/desktop-stage.css`,
dentro de `(min-width: 1024px) and (hover: hover) and (pointer: fine)`.
Fuera de esa condición la escena permanece oculta, sus imágenes no se solicitan
y se conservan los estilos anteriores de mobile, también en horizontal.
No se modifica StPageFlip, la geometría del libro, navegación ni comercio.

## Cancha limpia y logo independiente

La composición usa dos assets separados, no la fotografía con marca integrada:

- `src/assets/desktop/padel-court-clean-wide.webp`: cancha apaisada con la pared
  sin logo, 1448 × 1086, WebP calidad 88 (aprox. 260 KiB). Se optimizó directamente
  `references/desktop/padel-court-background-clean.png`, sin generar otra imagen.
- `src/assets/desktop/starvie-wall-logo.webp`: logo original con alfa, 2000 × 449,
  WebP lossless. Extraído del recurso `/X5` de la primera página del PDF local
  de la colección 2027, en `starvie-2027/`; no se redibujó la marca.

El original `padel-court-background.webp` y la anterior variante vertical
`padel-court-clean.webp` se conservan pero la escena ya no los usa.
Los intentos de recorte del logo con imagegen se descartaron a favor del original.

`DesktopStageBackground` contiene el marco de la cancha y una capa hermana
`desktop-stage-background__wall-logo`. El logo usa coordenadas del stage,
independientes del encuadre de la foto; mover la cancha ya no mueve la marca.

Valores de composición:

- Cancha nítida a todo el stage: `inset: 0`, `background-size: cover`, posición
  `50% 42%`, sin deformar la proporción de la imagen. La fuente apaisada `4 / 3`
  sustituye a la vertical `217 / 290`: muestra más pared, red y suelo para el
  mismo ancho de ventana. Se elimina el relleno lateral desenfocado y su filtro;
  todo el ancho usa una sola fotografía nítida.
- Logo: ancho `min(64vw, 1200px)`, X `59%`, proporción `2000 / 449`, posición
  superior `toolbar-height + clamp(0px, 0.4dvh, 6px)`. Un límite de ancho según
  el espacio superior de la ventana adapta el mural en desktops de poca altura;
  en hasta 700 px de alto el anclaje usa `toolbar-height + 8px`.
  A 1440 × 900 mide aprox. `922px` (antes `720px`, +28%); a 1672 × 941 mide
  aprox. `1029px`, +43%. La geometría del catálogo no interviene ni cambia.
- Proyección mural: `skewY(-5deg) scaleY(0.82)` en una marca interna, con origen
  central. La caja externa se mide sin esa proyección, y el vuelo termina con
  exactamente la misma matriz visual. La pintura usa alfa `0.62` para dejar ver
  el material y la iluminación originales; el grano de `3px` es más suave
  (alfa mínimo `0.88`, antes `0.72`). No hay sombras ni filtros en el mural.
- Header: sin cambios, fondo oscuro con alfa `0.54`, blur `8px` y textos e iconos
  con los colores anteriores.

## Desprendimiento, vuelo y pintura mural

`Magazine` entrega una instantánea de sus estados existentes al componente:
índice activo, contratapa, transición y portada lista. La escena solo observa;
no llama al engine ni cambia navegación, geometría, timers o física del libro.
`desktopLogoFlight.ts` traduce la fase `running` a apertura/cierre. Las fases
`prepare` y `aligned` no disparan el efecto, ni los giros entre páginas interiores.

La capa temporal `desktop-logo-flight` es hermana de la cancha y pasa por delante
del libro (`z-index: 20`), por debajo del header y los modales. Usa el mismo asset
con alfa que el mural. El origen se calcula con las dimensiones estables del
renderer y los límites del logo original en la portada: X `1825/6000`, Y
`1400/3375`, ancho `2350/6000`, alto `528.125/3375`. Si la portada está oculta al
cerrar, se leen sus dimensiones inline, no sus `offsetWidth/Height` en cero.
El destino se ajusta a la imagen real dentro de la caja del mural (`contain`).

Web Animations API usa una curva Bézier continua entre los centros de la portada
y el mural, muestreada una vez en 61 keyframes. Una interpolación quíntica tiene
velocidad y aceleración cero al despegar y al llegar: sustituye las cinco poses
con easings distintos, que frenaban/reaceleraban en cada segmento. La escala
crece de forma continua y monotónica, sin el anterior overshoot de `1.015`.
La profundidad máxima pasa de `110px` a `32px`, con perspectiva `1400px`;
las rotaciones máximas son X `-4°`, Y `6°`, Z `-1.5°` y vuelven suavemente a cero.

La llegada sucede al `78%` del tiempo y el logo permanece inmóvil mientras se
integra a la pintura entre `78%` y `98%`. Ambas capas comparten proyección,
posición y el mismo progreso de entrega: no se cambia de tamaño/posición al
sustituir la copia temporal por el mural. Solo se animan `transform` y `opacity`;
la sombra temporal se reduce a `0 7px 10px / 22%`.
El cierre usa exactamente la misma trayectoria y entrega con `direction: reverse`.
Las tapas usan `HARD_COVER_FLIP_MS` (`950ms`) y los atajos de sección `760ms`.
Ambas capas comienzan en el mismo tick del documento. El estado de reposo real
del libro es autoritativo: al terminar se elimina cualquier efecto restante.

Durante el vuelo se reutiliza `cover-base-image` con una máscara de bordes suaves
para ocultar la marca impresa; el selector prevalece sobre los estilos nativos
de apertura, evitando un logo duplicado o un recorte rectangular visible.
No se modifica el asset de portada. La contratapa usa su overlay existente.
Al cerrar no queda logo en la pared; al abrir queda el mural más grande.

Cada transición tiene ID y generación para descartar callbacks anteriores.
Un giro cancelado reconcilia el destino con el estado real. Resize, pestaña
oculta o salida del breakpoint cancelan las coordenadas antiguas. Se limpian
animaciones, atributos e inline styles, incluido `will-change`, al terminar o
desmontar. Con `prefers-reduced-motion: reduce` se aplica directamente el estado
de destino, sin vuelo. No se agregan dependencias ni otro controlador del libro.

## Superficie de las hojas: 92%, con una limitación deliberada

`--desktop-sheet-surface-alpha: 0.92` afecta exclusivamente al color de fondo de
`.catalog-leaf[data-density="soft"]:has(> .pdf-page)`. El fondo redundante de
su `.pdf-page` pasa a transparente para no acumular dos capas oscuras.
Cambiar la variable a `1` devuelve la superficie a opaca.

No se aplica `opacity`, mezcla ni filtros a hojas, imágenes, textos, productos,
tablas, iconos ni hotspots. Se conservan bordes y sombras. Tapas, video y páginas
editoriales mantienen sus fondos originales.

**Las páginas PDF son bitmaps opacos que ya incluyen el fondo y el contenido.**
Por eso su aspecto efectivo sigue siendo opaco: cambiar el fondo CSS que hay
debajo no permite ver la cancha a través del bitmap. El 92% está preparado en la
superficie, pero no se simula transparencia degradando la imagen completa.
Para conseguir el efecto visible en esas páginas harían falta assets con fondo
y contenido separados, lo que está fuera del alcance de no modificar páginas.

## ProductModal sobre la cancha

Todo el tratamiento está en CSS compartido. `ProductModal` no cambia su JSX,
estado, galería, zoom, handlers ni efectos. Al detectar su portal con
`body:has(> .modal-backdrop > .product-modal:not(.checkout-modal))`:

- El stage del libro y el drawer de miniaturas se ocultan inmediatamente con
  `visibility: hidden`, `opacity: 0` y sin transición de salida. Así no quedan
  hojas visibles durante la entrada de la ficha. El libro sigue montado,
  conserva dimensiones y página, y recupera visibilidad al cerrar el portal.
- El stage reaparece con un fade de 140 ms, desactivado con movimiento reducido.
  No se añaden timers, reseteos, navegación ni estado React duplicado.
- El backdrop usa negro al `12%`, sin `backdrop-filter`. La superficie principal
  usa `--desktop-product-surface-alpha: 0.9` en los dos extremos de su gradiente.
  Los fondos oscuros redundantes de `.product-visual` y `.gallery-thumbs` pasan
  a transparente. `.product-main-image` conserva solo un acento radial al `6%`.
  La oscuridad base combinada con el backdrop es aproximadamente `91.2%`.
- No hay `opacity` ni animaciones de opacidad sobre el modal completo. Texto,
  producto, thumbnails, controles y acciones conservan sus estilos y opacidad.
  El viewport claro de la imagen y los fondos de los controles siguen sólidos.
- Checkout queda excluido de todos los selectores; carrito y mobile conservan
  el tratamiento anterior.

## Procedencia de la cancha

La iteración de refinamiento usa la referencia apaisada existente
`references/desktop/padel-court-background-clean.png`, convertida a WebP con
Sharp (sin recorte, escalado ni generación). `desktop-stage-reference.png` es
la referencia principal de composición. Se conservan la foto y el logo anteriores.

Procedencia de la variante vertical anterior, conservada como asset:

Se usó la herramienta incorporada `image_gen` (no CLI). El resultado seleccionado
se convirtió a WebP para el proyecto; el logo usado se extrajo del PDF original.
Prompt exacto de la cancha:

> Use case: precise-object-edit. Edit target: the attached photograph of the indoor padel court, used as an existing website background. Create a clean unbranded plate of this EXACT photo. Remove the large STARVIE lettering and red star from the upper back wall, reconstructing the same dark textured wall, haze and light beams seamlessly. Also remove the small red star decals on the back glass and the little repeated STARVIE text on the net tape, replacing with plain glass/net tape. Preserve EVERYTHING else: exact camera angle, composition, portrait aspect ratio 1792:2400, perspective, structural posts, mesh, net location, court floor texture, red floor lines, red accent lighting, overhead lights, colors, contrast, photographic realism. Do NOT crop, zoom, reframe, rearrange the court or add elements. No text, no logo, no watermark. This clean plate must be visually matched to the original so a separate logo can be composited later.

## Revisión de esta iteración

Se verificaron apertura, cierre inverso, reapertura, navegación posterior,
contratapa, atajos, movimiento reducido y cambio de viewport con Playwright.
Las pruebas comprueban continuidad y escala, máscara durante el giro,
coincidencia de los rectángulos proyectados durante la entrega a la pared,
eliminación de estilos temporales y conservación del mismo nodo/geometría del libro.
Mobile no activa el efecto ni solicita el asset del logo; las capturas de portada
y páginas abiertas en portrait y landscape coinciden exactamente con las tomadas
antes del refinamiento. Se revisó la composición abierta a 1440 × 900,
1672 × 941 (similar a la referencia), 1366 × 768 y 1440 × 650.

Validaciones locales: `desktopLogoFlight`, `hardCoverMotion` y `bookFlow`
(17 unitarias); E2E `desktop-logo-flight`, `navigation-race`, `navigation-geometry`
y `back-cover-orientation`; `npm run build` y `git diff --check`.
Resultado del refinamiento: 17 unitarias y 22 E2E aprobadas; 8 casos omitidos
por pertenecer al otro tipo de dispositivo. Build y revisión de whitespace OK.
El build conserva el aviso de chunk JavaScript mayor a 500 kB.
No se hizo commit, push ni deploy. Los cambios mobile preexistentes se preservan.
