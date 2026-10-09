# P17 experimental: hoja propia dentro del visor aprobado

El piloto se abre con `/?mobile-pilot=17`. La entrada habitual `/` sigue siendo
el catálogo aprobado. En ambas entradas hay un único `Magazine` y un único
StPageFlip; no existe un shell ni un sistema de navegación mobile paralelo.

Sólo `(max-width: 599px) and (orientation: portrait)` sustituye el contenido de
P17 por `MobileP17Page`. Desktop, tablet y teléfono landscape muestran el PDF
original. P27/P28 y las demás páginas conservan sus componentes y assets.

## Arquitectura y geometría autorizada

- `App.tsx` monta siempre Magazine. El parámetro experimental permite entrar
  directamente en P17 y habilita la sustitución de esa hoja.
- Magazine resuelve Raptor+ mediante CommerceContext y entrega la hoja al slot
  `mobileP17Content` del engine. No hay copia de catálogo, carrito ni precios.
- `MobileP17Page` compone encabezado GAMA SUPER PRO / PROFESIONAL Y SEMI PRO,
  título, claim real, hero completa, resumen de cuatro specs y CTA EXPLORAR.
  `MobileP17Technical` aporta las nueve tecnologías, arco, iconos del arte
  original, punto dulce vectorial con rojo elevado y tabla de datos vivos.
  Su botón declara `data-product-id`: el delegado y el árbitro de gestos
  **originales** de StPageFlip distinguen tap/drag y suprimen click residual.
- El usuario autorizó cambiar exclusivamente la geometría de P17 portrait.
  En reposo llena los dos ejes de la banda entre header y guía, sin ratio fijo.
  CSS calcula esa banda con dvh/safe areas; un ResizeObserver local a P17
  sincroniza su ratio actual con las dimensiones que recibe StPageFlip.
  Se conservan tiempos, sombras, cálculo del curl,
  tapas y handlers originales. No se recrea el engine al navegar o rotar.
  La geometría se congela durante el giro y vuelve a 960:540 cuando termina
  en otra hoja. Durante el giro, la vecina original se contiene en el marco
  vertical; al asentarse recupera su formato horizontal. Esta adaptación
  del marco entre formatos es una limitación visual del piloto para evaluar.
- CSS aislado en `.mobile-p17-page` y `.mobile-p17-frame`.
  No se editaron styles.css, hardCoverMotion, ni las reglas globales del visor.
  El marco reserva espacio para la guía y botones actuales sin moverlos.
- Pala, Explorar y el botón circular de bolsa abren el ProductModal original.
  Conserva el controlador de zoom/galería y usa CSS de imagen para teléfonos
  portrait. Aísla mousemove/touchmove del libro para permitir scroll nativo,
  como se detalla en la corrección de scroll al final de este documento.
  No hay presentación experimental de ficha ni transición de hero. Galería,
  precios/stock, cantidades, carrito y checkout usan el flujo original.
- La galería original mantiene sus cuatro imágenes reales, miniaturas y
  flechas. Tap alterna 1×/2×; controles avanzan de a 0.5× hasta 4×, con reset,
  pinch y pan originales. Seleccionar otra imagen restablece el zoom.
- La ficha se mantiene abierta al rotar y conserva imagen/cantidad; cerrar
  vuelve al mismo índice del mismo engine. El carrito/checkout son los originales.

## Infraestructura retirada y reutilizada

Se eliminaron MobileMagazineShell, MobilePilotPresentation y MobilePageTurn,
con su header/navigation/retorno, handoff entre renderers, ocho franjas 3D,
RAF/timeout de giro, sombras/lomo/grosor de libro y CSS de shell alternativo.
MobileEditorialPage fue sustituida por MobileP17Page, limitada a contenido.
Se quitaron iconos y tests del giro alternativo. CartDrawer volvió exactamente
al contrato original; ya no necesita `managesUiBusy` para otro shell.

Se reutilizan mobileProductPresentation, ProductImage/ProductGalleryImage,
MobileIcon y ProductModal original. Se retiraron MobileProductSheet,
mobileHeroTransition, useMobileGestures y el CSS de la ficha experimental.
Los gestos de la hoja siguen perteneciendo al engine original; los del zoom
de la ficha pertenecen al ProductModal original.

## Identidad, hero y galería

Raptor+: productId `raptor+`, SKU `PSTRP41000`, página 17.
Hotspot original: `raptor+-page-17`. `raptor-plus` es un registro editorial
legado, no la identidad comercial. El claim BREAK THE RULES procede del asset.
Plano 3D Carbon; forma Lágrima; peso 350–370 g; balance Medio, desde datos vivos.

`src/data/mobileProductPresentation.ts` conserva:

```ts
mobileHero: { source: "hero/raptor-mobile.webp", role: "hero", scale: 1 },
gallery: [], // Las cuatro imágenes del producto vivo, sin reemplazos.
```

| Archivo | Resolución | Formato | Peso |
| --- | --- | --- | --- |
| references/mobile/raptor.png, fuente original intacta fuera de public | 941×1672 | PNG RGB | 2.248.680 bytes |
| public/hero/raptor-mobile.webp, reutilizada | 1024×1536 | WebP RGB, calidad 86 | 220.570 bytes, 215,4 KiB |

Referencia PNG actual SHA-256: 5331c2e33468b3b6999dcafd201c089686211cd81092daabcd14501bd1ab7c97.
El PNG actual es el mockup completo de la hoja (incluye títulos, tecnologías y
datos dibujados). Se usa como referencia de composición. El WebP conserva la
hero de producto independiente de la etapa anterior; no es una conversión de
ese mockup y no duplica sus textos. Ambos archivos se conservaron sin editar.
La fuente PNG se trasladó fuera de public verificando el SHA-256 antes y
después: no se solicita en runtime y no se copia al build. Sólo el WebP de
220.570 bytes se incluye como hero publicable. El PNG fuente se versiona como
referencia original por autorización explícita, con su SHA-256 intacto. Las
capturas y videos de revisión se conservan localmente y no se versionan.
La imagen completa usa contain, escala 1 y máscaras de integración de bordes
sin recortar la pala. No se modificaron estos archivos en la simplificación.

La hero sólo se monta en portrait con el piloto activo y P17 actual, vecina
inmediata P16/P18 o destino de un salto hacia P17. La vecindad de una hoja
permite que el giro nativo la revele ya cargada. En páginas alejadas se retira
el img. No hay probes/prefetch de heroes adicionales. La galería real sólo se
solicita al abrir la ficha, con las variantes ya existentes y decode.
Las nueve ventanas de iconos reutilizan una única URL del WebP original P17
(108.874 bytes), sin modificarlo ni exportar nuevos raster. Sólo se carga con
la vecindad inmediata habilitada. El E2E verifica una solicitud de ese arte
y una de la hero; no hay nueve descargas ni héroes hipotéticas.

La galería contiene RAPTOR1.3.webp, RAPTOR1.4.webp, RAPTOR1.2.webp y RAPTOR1.5.webp
bajo products/palas/RAPTOR, mediante sus derivados del catálogo. Precio pendiente
no muestra $0, NaN ni Consultar precio. Agregar persiste sólo productId + qty.

## Abrir desde el teléfono

PC y teléfono en la misma Wi-Fi; usar portrait:

```powershell
Set-Location C:\starvieCatalog2027
npm run dev -- --strictPort
```

URL actual: http://192.168.1.17:5173/?mobile-pilot=17
PC: http://localhost:5173/?mobile-pilot=17
Para comparar, abrir `/`, usar el contador y elegir 17.
Si cambia la IP, usar la URL Network de Vite. Reutilizar el servidor existente
si 5173 está ocupado. Comprobar permiso de Node en firewall de red privada si
el teléfono no conecta; no desactivar el firewall. No enviar pedidos reales.

## Validación y capturas

Unitarios: mobilePilot, ProductModal, CatalogData y comercio/checkout.
E2E mobile-pilot: selección por viewport, mismo engine,
controles/guía idénticos, swipe desde hero sin click residual, navegación,
P27 original con 11 destinos, retorno a la misma hoja, cuatro imágenes reales, zoom/pan,
rotación, precio pendiente/carrito, fallback y movimiento reducido.
Además: mobile-navigation, navigation-race, navigation-geometry,
back-cover-orientation, product-modal y page-image-loading.

```powershell
npm run build
npx playwright test e2e/mobile-pilot.spec.ts e2e/product-modal.spec.ts e2e/mobile-navigation.spec.ts --config=playwright.preview.config.ts --workers=1
git diff --check
```

Capturas Galaxy S25 aproximado, viewport 360×780 (Chromium mobile):
- tmp/p17-original-detail-review/p17-final.png
- tmp/p17-original-detail-review/product-mobile-original.png
- tmp/p17-original-detail-review/p17-comparison.json

Las capturas se toman con animaciones desactivadas sólo para revisión.
La aplicación conserva la animación original de ProductModal. El fingerprint
E2E compara markup y cajas después de que termina esa animación.

No es una prueba en hardware Galaxy real. El E2E compara HTML y cajas del
header, navegación y guía entre P17 original y custom, y verifica que la hoja
vertical no los invade. El resto del catálogo no tiene diseños nuevos.

Resultados del cierre (2026-10-07): 60 unitarios aprobados. Lote amplio E2E:
49 aprobados, 14 omitidos por tipo de dispositivo y 1 fallo intermitente de
navigation-race (esperaba P4 y recibió P3, tras la secuencia de inversión).
Repetición serial con el build final de piloto + navigation-race +
page-image-loading: 25 aprobados, 5 omitidos, sin fallos. El piloto tiene 9
casos ejecutables aprobados. Los demás casos de navegación, tapas y ficha
original pasaron en el lote amplio. Se conservó el test de carrera sin cambios;
no se alteraron handlers para resolver una carrera de temporización del test.
Build y git diff --check aprobados. Vite mantiene el aviso del bundle >500 KB.
Servidor comprobado: HTTP 200 en localhost y 192.168.1.17:5173.

Ajuste editorial posterior de P17 (2026-10-07): 50 unitarios aprobados y 9 E2E
del piloto aprobados, 5 omitidos por dispositivo. Las regresiones de
mobile-navigation y product-modal pasaron también. La prueba del nuevo lateral
se corrigió para cruzar suficientemente la bisagra y completar el pliegue nativo;
no se modificaron el engine ni sus gestos. Build y git diff --check aprobados.
Archivos de este ajuste: MobileP17Page.tsx, MobileP17Technical.tsx (nuevo),
mobile-pilot.css, MobileProductSheet.tsx, ProductModal.tsx, mobilePilot.test.tsx,
e2e/mobile-pilot.spec.ts y este documento. App, Magazine, PageFlipEngine, datos
comerciales y archivos de imágenes no se modificaron en este ajuste.

Ajuste de tamaño anterior, sustituido por el llenado sin ratio fijo descrito
abajo (2026-10-07): el marco usaba `100dvh` y
las safe areas para calcular la banda entre el header existente y el borde
superior de la guía. Se reserva un margen mínimo de 6 px; ancho y alto se
maximizan juntos conservando 960:1655. Cuando limita el ancho, queda el espacio
vertical inevitable para conservar esa proporción. Se refleja la geometría
congelada de la guía (46 px) y el padding existente del stage (76 px), sin
modificar ninguno. El desplazamiento centra la hoja en esa banda de lectura.
No hay cambios de contenido, engine, navegación, ficha ni interfaz exterior.

E2E nuevos: máximo tamaño disponible, comparación de HTML/cajas de la interfaz,
sin scroll ni solapamientos en 360×780 (aproximación Galaxy S25), 390×844 y
412×915, más safe areas asimétricas simuladas. Capturas revisadas visualmente:
`tmp/p17-sizing-review/p17-360x780.png`, `p17-390x844.png`, `p17-412x915.png`.
No equivale a validación en hardware físico.

Validación de este ajuste: 50 unitarios aprobados. Piloto + mobile-navigation +
product-modal: repetición completa con 23 aprobados y 15 omitidos por dispositivo.
La primera pasada tuvo un fallo intermitente del foco al cerrar la ficha;
el caso aislado y la repetición completa pasaron sin cambiar lógica de foco.
Build y `git diff --check` aprobados; sin nuevas dependencias ni assets.
Archivos de esta iteración: mobile-pilot.css, e2e/mobile-pilot.spec.ts y este
documento. La URL Wi-Fi `http://192.168.1.17:5173/?mobile-pilot=17` responde HTTP
200; usar el teléfono en la misma red y orientación portrait. Sin commit,
push, deploy ni pedidos reales.

## P17 llena el rectángulo útil sin ratio fijo

La revisión posterior elimina tanto el ratio 960:1655 del marco como el
letterboxing del cálculo nativo para esta hoja. Ancho y alto son independientes:
100vw menos safe areas laterales; 100dvh menos header, guía y su offset inferior.
Margen técnico actual: 0 px. El fondo CSS negro/rojo llena el rectángulo completo.
La guía y su altura de 46 px, el header de 48 px y los controles no cambian.

El adaptador existente de P17 en PageFlipEngine entrega el ratio medido de su
marco al mismo StPageFlip. Un ResizeObserver, activo sólo durante P17 portrait
en reposo, sincroniza cambios de dvh/safe areas. Se desconecta al salir de P17;
el motor recupera 960:540. No hay nueva física, motor, navegación ni handlers.

La composición HTML usa posiciones relativas a ambos ejes, con una unidad
interna limitada por ancho y alto para tamaños/gaps. La hero sigue usando
object-fit contain; iconos cuadrados, punto dulce SVG, logos y texto mantienen
su proporción individual. El resumen inferior reserva espacio para el CTA
de 44 px también en bandas de lectura compactas. No cambian datos ni assets.

Capturas limpias y con límites marcados: `tmp/p17-fill-review/p17-WxH.png` y
`p17-WxH-bounds.png`. Los JSON `bounds-WxH.json` guardan medidas reales del DOM.
Las anotaciones se añaden sólo durante el E2E, no son interfaz de la aplicación.

| Viewport | Hoja | Header bottom = P17 top | P17 bottom = guía top |
| --- | --- | --- | --- |
| 360×780, Galaxy S25 simulado, DPR 3 | 360×606 | 48 | 654 |
| 390×844, DPR 3 | 390×670 | 48 | 718 |
| 412×915, DPR 3 | 412×741 | 48 | 789 |

Sin safe area lateral, P17 empieza en x=0 y termina en el ancho del viewport.
No es una prueba en un Galaxy físico. Safe areas asimétricas también se simulan
en E2E; la hoja se ajusta a los bordes seguros en ambos ejes sin mantener ratio.

Validación: 50 unitarios aprobados; lote de mobile-pilot, mobile-navigation y
product-modal con 24 aprobados y 16 omitidos por dispositivo. Después de
conservar el ancho natural del bitmap para mantener su máscara de bordes,
cinco casos de tamaño/ficha pasaron de nuevo con el build final y regeneraron
las capturas marcadas. Build y git diff --check aprobados. Se verificaron
resize, regreso a geometría original en P18, rotación, tap/swipe sin click
residual, cierre de ficha, galería real, precio pendiente y carrito compartido.
Archivos de esta revisión: mobile-pilot.css, el adaptador P17 existente en
PageFlipEngine.tsx, e2e/mobile-pilot.spec.ts y este documento. Sin commit,
push, deploy ni pedidos reales.

## Restauración de la ficha original (2026-10-08)

Flujo final: visor original → hoja P17 premium aprobada → pala/Explorar →
ProductModal original. ProductModal.tsx es idéntico byte por byte a la base Git.
Magazine deja de seleccionar el renderer experimental y de medir el origen
de la hero. Se recuperan el cierre y bloqueo de navegación originales.

Retirados: MobileProductSheet.tsx, mobileHeroTransition.ts, useMobileGestures.ts,
selector mobile-v2, sus animaciones/CSS, el portal alternativo y los tests
exclusivos de la ficha experimental. MobileIcon, componentes/datos de P17,
ProductGalleryImage y toda la lógica comercial original se conservan.

P17Page, P17Technical, PageFlipEngine y el prefijo CSS completo de P17 se
compararon con la copia previa: sin cambios. La captura 360×780 DPR3 de P17
aprobada y la final tienen 0 píxeles distintos. El modal se compara en HTML y
geometría con la entrada original, incluyendo desktop/tablet/landscape.

Resultados: 314 unitarios aprobados y 9 omitidos del harness HTTP especial;
26 E2E aprobados y 16 omitidos por dispositivo. La comparación inicial tomó
medidas durante la animación original de entrada; el test ahora espera su
finalización. Lote final completo sin fallos. Build y git diff --check aprobados.
Carrito/checkout verificados sin enviar pedidos. Sin commit, push ni deploy.

## Dos ajustes visuales finales (2026-10-08)

P17 incorpora un botón circular de bolsa de 44×44 px, en el espacio libre
superior derecho. Declara el mismo productId que Explorar y la pala: abre la
ficha; no agrega al carrito. Incluye aria-haspopup dialog, nombre accesible,
disabled acorde a la hoja, foco y feedback activo. Reutiliza el delegado
original de StPageFlip, incluso para swipe sin click residual. La comparación
360×780 DPR3 tiene 0 píxeles distintos fuera del rectángulo de ese botón.

product-modal-mobile.css sólo aplica hasta 599 px y en portrait. El área visual
gana altura (min(55dvh, 480px)) y reduce padding; el viewport de foto pierde el
fondo blanco, radios y sombra de tarjeta. Object-fit sigue siendo contain sin
un escalado base ni cambios de imágenes. La pala a 1× gana más de 20% de tamaño
visible en 360×780. Miniaturas conservan su CSS y estructura originales.

Flechas, zoom y contador se superponen sobre la imagen. El contador se pinta
por encima de la imagen ampliada y deja pasar gestos. ProductModal.tsx sólo
agrega la importación de CSS; al retirarla, coincide exactamente con Git.
Zoom, pinch/pan, decode, galería, datos, precio/stock y comercio no cambian.
Desktop, tablet y landscape conservan su viewport blanco y geometría anterior.

Capturas finales en tmp/p17-visual-polish: p17-with-button.png, product-clean.png
y product-zoom-4x.png. La comparación se guarda en p17-comparison.json. Los
directorios de capturas anteriores documentan etapas previas del piloto.

Validación final de estos dos ajustes: 36 unitarios aprobados; 28 E2E aprobados
y 18 omitidos por dispositivo. Build y git diff --check aprobados. Se verifican
apertura por bolsa/pala/Explorar, ausencia de agregado directo, foco y target,
swipe sin click residual, cuatro imágenes reales, thumbnails, zoom 1×/2×/4×,
pinch/pan, cierre/retorno y carrito/checkout sin enviar pedidos. Desktop/tablet
(incluido 600 px) y landscape (incluido 568×320) conservan el estilo anterior.
Sin commit, push ni deploy.

## Scroll táctil del ProductModal y posición de bolsa (2026-10-08)

Se mueve únicamente la posición horizontal de la bolsa: centro al 78% del
ancho de la hoja, manteniendo 44×44, altura, estilos y delegado originales.

La regresión de scroll se reprodujo con un movimiento de ratón compatible
sobre las specs del modal en la esquina de P17. El listener global de
StPageFlip activaba fold_corner detrás del diálogo; su touchmove cancelaba
el gesto vertical. El modal tenía overflow auto efectivo (910 px de contenido
frente a 754 px visibles en 360×780), pero scrollTop permanecía en 0.

ProductModal aísla mousemove y touchmove sólo en teléfonos portrait mediante
stopPropagation, sin preventDefault. No cambia alturas, overflow, body lock,
pointer capture ni handlers de imagen. El scroll nativo queda disponible;
pinch/pan siguen limitados al stage y desktop/tablet/landscape conservan los
eventos anteriores. No se modifica StPageFlip.

El E2E nuevo falla antes de la corrección y pasa después: swipe CDP iniciado
en specs visibles, medición de scrollTop, fondo de la ficha y CTA completo,
regreso arriba, pan a 4×, scroll fuera del stage con zoom aún activo, thumbnails
y cierre/retorno. Cubre 360×780, 390×844 y 412×915. Dos unitarios verifican
aislamiento sólo dentro del breakpoint y ausencia de cancelación del scroll.
Capturas: tmp/p17-scroll-fix/p17-button-repositioned.png y
tmp/p17-scroll-fix/modal-scrolled-bottom.png. No se envían pedidos reales.

Validación final: 38 unitarios aprobados; 31 E2E aprobados y 21 omitidos por
dispositivo, incluido pinch/pan original y aislamiento desktop/tablet/landscape.
Build y git diff --check aprobados. Comparación 360×780 DPR3: 0 píxeles
distintos fuera de las dos posiciones de la bolsa; el único cambio de CSS
de P17 es right. URL del video verificada con ambos ajustes:
http://192.168.1.17:5174/?mobile-pilot=17. Sin commit, push ni deploy.

## Revisión previa al commit (2026-10-08)

Se revisaron el diff completo, los componentes nuevos y los archivos públicos.
raptor.png no tiene referencias runtime: se movió a references/mobile/raptor.png
sin modificar sus bytes (SHA-256 idéntico al registrado arriba). public/hero y
dist/hero contienen sólo raptor-mobile.webp, 1024×1536 y 220.570 bytes.
El build evita copiar los 2.248.680 bytes de la fuente local.

Validación completa del frontend:

```powershell
npm test
npm run build
npx playwright test --config=playwright.preview.config.ts --workers=1
npm run build
git diff --check
git diff --cached --check
```

414 unitarios aprobados; 9 omitidos del harness HTTP especial que requiere WSL
y STARVIE_LOCAL_INTEGRATION=1. Todos los 216 E2E fueron evaluados: 183 aprobados
y 33 omitidos por tipo de dispositivo, sin fallos. Se cubrieron entrada normal
y opt-in portrait, aislamiento desktop/tablet/landscape, modal original,
scroll táctil de specs antes/después de zoom, pinch/pan, galería, bolsa/Explorar,
carrito/checkout, flips, decode/preload, P14, P27, editoriales, video y contratapa.
No se enviaron pedidos reales. Build aprobado con el aviso existente de tamaño
del bundle mayor a 500 kB.

El stage aprobado incluye 17 archivos: código, tests, documentación, hero WebP
y references/mobile/raptor.png como fuente original con SHA-256 intacto.
Se excluyen tmp, dist, test-results, screenshots y referencias WhatsApp.
Se autoriza el commit feat(mobile): add opt-in premium P17 portrait pilot;
push y deploy quedan pendientes de autorización.
