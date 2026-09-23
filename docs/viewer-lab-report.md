# ETERNAL — evolución del viewer-lab

Fecha: 2026-09-11. Proyecto: `C:\starvieCatalog2027`. Ruta: `/viewer-lab` (también conserva `?viewer-lab`). Vista previa de esta sesión: http://127.0.0.1:5174/viewer-lab.

## 1. Auditoría visual e inventario utilizado

Se inspeccionaron visualmente los ocho archivos originales antes de implementar. Resoluciones y transparencia se comprobaron con Sharp. Todos contienen canal alfa con píxeles transparentes. Los ángulos son estimaciones visuales, no mediciones de cámara.

| Original | Resolución | Alfa | Contenido / encuadre | Ángulo aproximado | Uso final |
|---|---|---|---|---|---|
| ETERNAL1.4.webp | 4612 × 4612 | Sí | Pala completa de frente | 0° | Vista Frente; hotspots |
| ETERNAL1.3.webp | 4612 × 4612 | Sí | Pala completa oblicua | 25–40° | Vista Perspectiva |
| ETERNAL1.2.webp | 5373 × 5373 | Sí | Canto recortado; no contiene pala completa | Lateral, alrededor de 90° | Detalle Perfil del marco |
| ETERNAL1.1.webp | 3233 × 3233 | Sí | Puente, base de la cara y comienzo del mango | Casi frontal | Detalle Puente |
| ETERNAL1.5.webp | 3149 × 3150 | Sí | Canto oblicuo con piezas Power Balance | Oblicuo, aproximadamente 50–70° | Detalle Power Balance |
| ETERNAL1.6.webp | 3648 × 3648 | Sí | Relieve, dibujo y perforaciones de la cara | Frontal cercano con ligera oblicuidad | Detalle Superficie y textura |
| MANGO.webp | 5373 × 5373 | Sí | Grip y muñequera con marca legible | Oblicuo y composición diagonal | Detalle Grip y muñequera |
| ACCESORIO.webp | 4612 × 4612 | Sí | Cuatro piezas Power Balance y etiqueta | Composición de accesorios; no es ángulo de pala | Detalle y acceso destacado Accesorios Power Balance |

Resultado: **2 vistas completas y 6 detalles**. El antiguo tercer estado “perfil” era un macro, por eso deja de formar parte de la rotación. El archivo previo `public/viewer-lab/padel/side.webp` se conserva, pero ya no se usa como silueta completa.

## 2. Experiencia elegida

“Explorá la pala”: escenario grande de fondo oscuro, producto blanco/dorado, sombra, arrastre corto, dos controles de ángulo y un único control de autoplay. Se retiran slider y reset redundantes. En mobile aumenta el tamaño de la pala respecto del primer encuadre revisado.

Los detalles son accesibles desde cuatro hotspots frontales y una lista de seis entradas. Una pieza visual destaca los accesorios Power Balance. La vista de detalle muestra fotografía grande, texto descriptivo neutral, zoom 2×, desplazamiento, navegación anterior/siguiente y cierre con botón o Escape. El diálogo nativo contiene el foco y lo devuelve al disparador al cerrar.

## 3. Rotación extendida

Descartada con estos assets. Solo se representa el rango frontal–perspectiva realmente fotografiado. No hay fotografía completa del dorso, perspectiva contraria ni lateral completo. La similitud aparente de las caras no demuestra identidad. No se espejan logos, firmas ni inscripciones, ni se deforma una foto para inventar ángulos.

Hay exactamente un elemento de imagen principal a la vez; el cambio es discreto, sin fundido de siluetas. Una animación breve de luminosidad de 150 ms suaviza el cambio. El movimiento local máximo es de 3 px, sin rotación artificial.

## 4–6. Sensibilidad y reconocimiento de gestos

- Mouse: **100 px por cambio** durante un arrastre controlado.
- Touch: **64 px por cambio**.
- Flick: desplazamiento mínimo de **18 px**, velocidad mínima de **0,5 px/ms**, última muestra de movimiento de como máximo **100 ms** antes de soltar.
- Histéresis: al entrar en otra vista hace falta volver un 30% del paso (30 px mouse / 19,2 px touch) para regresar durante el mismo gesto.
- Dirección: tolerancia inicial de 8 px; se reconoce horizontal si supera 1,2 veces el desplazamiento vertical. Se conserva `touch-action: pan-y` y se captura el puntero después de reconocer intención horizontal.
- Se respetan los extremos. No hay wrap ficticio. La función de gestos admite más vistas en otra configuración; Eternal tiene únicamente dos.
- Las flechas del teclado y los botones permiten cambiar de ángulo sin arrastrar.

## 7. Autoplay

Espera 8 segundos de inactividad antes de avanzar. Los cambios posteriores están separados por al menos 5 segundos, con recorrido de ida y vuelta. Pausa mientras hay un dedo/puntero presionado, interacción, hover sobre el escenario, foco dentro del explorador o un detalle abierto. También pausa al ocultarse la pestaña. Tras abandonar la interacción espera nuevamente 8 segundos. Mientras se mantiene el foco de teclado dentro del explorador no reanuda: evita cambios durante la inspección accesible.

El control Auto permite desactivarlo explícitamente. `prefers-reduced-motion` desactiva autoplay, animación y desplazamiento decorativo; responde también a cambios de la preferencia durante la sesión.

## 8. Hotspots

Cuatro zonas, solo en la vista frontal: superficie, puente, región del canto vinculada a Power Balance y grip. Coordenadas porcentuales relativas al plano cuadrado de la fotografía; el plano preserva su proporción en desktop y mobile. Áreas de interacción de 44 × 44 px, etiquetas accesibles y tooltip con mouse/foco. Los hotspots se ocultan durante el arrastre horizontal y en perspectiva. Perfil y accesorios se alcanzan desde la lista de detalles.

## 9. Macros y texto

- Superficie y textura: relieve, dibujo y perforaciones.
- Puente: encuentro entre cara, puente dorado y mango.
- Perfil del marco: canto lateral recortado, aberturas y firma.
- Power Balance: piezas visibles sobre el canto con inscripciones +4 y +2.
- Grip y muñequera: acabado del grip, base y muñequera.
- Accesorios Power Balance: cuatro piezas y etiqueta.

No se atribuyen unidades de peso, funcionamiento, ventajas de juego, materiales ni prestaciones no documentadas. El zoom permite mirar los assets originales; no genera detalle adicional.

## 10–11. Arquitectura y archivos

Modificados respecto del estado existente:

- `src/components/PadelViewerLab.tsx`: composición de la página aislada.
- `src/components/PadelViewer25D.tsx`: conserva la entrada existente y delega en el explorador.
- `src/data/padelViewer.ts`: tipos, producto, vistas, detalles, textos y hotspots configurables.
- `e2e/viewer-lab.spec.ts`: reemplaza expectativas del antiguo MVP por pruebas del explorador.

Creados:

- `src/components/explorer/PadelExplorer.tsx`: carga, estado, autoplay y composición.
- `src/components/explorer/ProductViewStage.tsx`: escenario e interacción.
- `src/components/explorer/ProductViewNavigation.tsx`: controles mínimos.
- `src/components/explorer/ProductHotspots.tsx`: puntos desde configuración.
- `src/components/explorer/ProductDetailViewer.tsx`: diálogo, zoom y desplazamiento.
- `src/components/explorer/gestures.ts` y `gestures.test.ts`: umbrales y lógica comprobable.
- `src/components/explorer/images.ts`: carga/decodificación compartida y reintento.
- `src/components/explorer/explorer.css`: estilos exclusivos del lab.
- `public/viewer-lab/padel/details/`: seis originales WebP y seis miniaturas de 320 px.
- `docs/viewer-lab-report.md`: este informe.

La configuración de producto define las imágenes, sus títulos, los hotspots y el detalle destacado. Las responsabilidades se separan sin agregar dependencias ni cambiar package-lock.

## 12. Performance y fidelidad

Se verificó igualdad byte por byte entre **los ocho originales** y sus imágenes utilizadas. No se recomprimen las vistas ni los macros originales. Las dos vistas principales suman 2.172.468 bytes (aproximadamente 2,17 MB); se precargan y decodifican antes de habilitar el escenario.

Los macros completos (aproximadamente 11,16 MB en total, 1,25–2,81 MB cada uno) solo se solicitan al abrir ese detalle. El siguiente macro no se precarga automáticamente. Las promesas de decodificación se reutilizan; la caché HTTP mantiene su política normal del servidor. Los errores eliminan la promesa fallida para permitir un reintento. Al cambiar de detalle se oculta la foto previa mientras carga la nueva, evitando mostrarla bajo un título incorrecto.

La entrada destacada usa una miniatura de accesorios de **12.110 bytes**, con carga diferida. Se generaron seis miniaturas reutilizables; actualmente solo se solicita la destacada. No hay solicitudes iniciales de macros completos, comprobado por E2E.

## 13. Validación

- `npm test`: **9 tests aprobados**, distribuidos en 3 archivos.
- E2E del visor: **16 aprobados**, 2 omitidos por ser específicos del dispositivo contrario.
- E2E del catálogo: **2 aprobados**, 2 omitidos según dispositivo.
- Total E2E aplicable: **18 aprobados**.
- `npm run build`: aprobado con TypeScript y Vite.
- Chromium desktop 1440 × 900 y Pixel 7 emulado. Eventos táctiles reales del navegador mediante CDP para drag y scroll vertical, además de streams deterministas para distancias/velocidad.
- Verificado: arrastre lento/corto, flick en ambas direcciones, extremos e histéresis, mouse real, teclado, scroll vertical, ancho mobile, hotspots, los seis macros, zoom/desplazamiento, Escape, cierre/foco, autoplay/pausa/reanudación/desactivación, reduced motion, carga/decodificación y fallo/reintento de un detalle.
- Sin errores de consola ni de ejecución en la prueba de carga inicial. La prueba de fallo de red provoca intencionalmente un asset fallido para verificar recuperación.
- Revisión visual: desktop, mobile, detalle mobile y los seis encuadres macro.
- Diez archivos existentes comparados con hashes anteriores a la implementación: App, estilos globales, PageFlipEngine, Magazine, CoverIntro, PdfPage, ProductModal, CatalogData, package.json y package-lock.json. **Todos intactos**.

Los E2E de esta sesión usaron `npx playwright test viewer-lab --config tmp/explorer.config.ts` y `npx playwright test catalog.spec.ts --config tmp/explorer.config.ts`. La configuración temporal conserva los proyectos de Playwright y apunta al servidor revisado en el puerto 5174; el puerto 5173 ya estaba ocupado. No se cambió la configuración normal del proyecto.

## 14. Límites y siguiente revisión

- Dos ángulos completos no permiten giro 360 ni inspección fotográfica del dorso.
- El marco de perfil sigue siendo un recorte original: no se reconstruye mango ni puente.
- Los assets de gran resolución pueden requerir más memoria y tardar en redes móviles lentas; se mantiene la fidelidad solicitada.
- Validado en Chromium y mobile emulado; queda la apreciación táctil en dispositivos físicos y la revisión en Safari/iOS.
- Textos descriptivos neutrales, pendientes de contenido comercial definitivo si se desea.
- No integrado en la página 14 ni en ninguna ficha del catálogo. No se publicó, no se hizo commit y se conservaron los cambios previos del repositorio.

El laboratorio queda listo para aprobación visual.
