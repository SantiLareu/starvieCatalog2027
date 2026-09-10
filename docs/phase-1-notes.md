# Fase 1 · investigación y decisiones

## Comportamiento observado en la referencia Siux

- La carga inicial muestra un estado `Cargando` con firma de Catálogo Plus y luego revela la interfaz.
- En desktop la portada aparece sola, centrada y a la misma altura que una página interior. No comienza pegada a una segunda página.
- El primer avance convierte el estado cerrado en spread. La portada gira desde el borde del lomo y el libro ocupa gradualmente el ancho de dos páginas.
- Los interiores giran de derecha a izquierda al avanzar y en sentido inverso al volver. La página inferior se revela a medida que se desplaza el pliegue.
- Durante el giro se ve el reverso de la hoja, semitransparente y ligeramente desaturado. La sombra exterior y la sombra sobre la hoja cambian de posición con el pliegue.
- El lomo permanece fijo en el centro del spread. Portada y contraportada se perciben más rígidas; los interiores muestran un pliegue blando recortado en diagonal.
- La transición observada se asienta aproximadamente en un segundo.
- En el viewport desktop observado (735 × 426), la portada medía aproximadamente 266 × 377 px y el spread 534 × 377 px: se mantiene la proporción de página sin deformación.
- Los controles laterales son dos pastillas verticales discretas: anterior/primera y siguiente/última. En portada sólo están activas las acciones hacia delante.
- El contador cambia de `1 / 20` a rangos como `2-3 / 20`. Al pulsarlo se convierte en un control numérico para navegación directa.
- El botón de miniaturas abre un drawer con lista vertical, numeración y página activa resaltada.
- Los hotspots de producto se señalan con círculos rojos. Al pulsar uno no cambia la página: abre una ficha modal encima del catálogo.
- La ficha observada tiene overlay oscuro, cierre superior, galería de imágenes, nombre, precio, cantidad y acción de carrito. La imagen puede terminar de cargar después de abrir el modal.
- Al cerrar la ficha se conserva exactamente el spread y la URL de página de la referencia.
- Existe un botón de carrito en la cabecera. No se ejecutaron acciones comerciales.
- En mobile (390 × 844) la cabecera se comprime, el contador pasa a una sola página (`4 / 20`), las flechas laterales desaparecen y la página ocupa el ancho disponible sin deformarse.
- El drawer de miniaturas también está disponible en mobile y ocupa una franja estrecha a la izquierda.
- Los gestos drag/swipe de la referencia no pudieron certificarse con la emulación de mouse disponible durante la inspección. En la implementación StarVie sí quedaron verificados con mouse real y eventos touch reales en Chromium.

La observación fue funcional y visual. No se reutilizaron código, recursos, identidad ni contenido de Siux.

## PDF StarVie 2027

- Archivo fuente: `starvie-2027/STARVIE COLECCIÓN 2027 ES VF.pdf`.
- 39 páginas, 1440 × 810 pt, relación 16:9 horizontal.
- P1: portada.
- P2–13: introducción y tecnologías StarVie Labs.
- P14: índice visual de palas.
- P15–26: palas y fichas técnicas.
- P27: índice de accesorios.
- P28–33: paleteros.
- P34–36: mochilas.
- P37: neceseres.
- P38: accesorios.
- P39: contraportada.

La relación horizontal produce un catálogo físico especialmente ancho en doble página. En mobile se mantiene una página 16:9 completa; el texto editorial pequeño está limitado por el diseño de origen y el ancho del dispositivo.

## Motor y trade-offs

Se usa el núcleo `page-flip` 2.0.7 directamente detrás de `PageFlipEngine`.

Ventajas:

- cálculo de pliegue con recorte poligonal, reverso y sombras;
- portadas duras e interiores blandos;
- drag con mouse y swipe touch;
- orientación simple/doble según espacio;
- HTML como página, necesario para la capa de hotspots;
- sin dependencias transitivas de runtime.

Limitaciones:

- la versión publicada es estable pero antigua;
- el motor posee y reestructura el DOM, por lo que el adaptador debe montarlo una sola vez y destruirlo explícitamente;
- el modo de página única puede clonar nodos; los clicks de hotspots se capturan de forma delegada;
- no virtualiza páginas por sí solo, de modo que la estrategia de miniatura/alta resolución se gestiona externamente;
- la geometría es una aproximación perceptual, no una simulación física de papel.

GSAP/CSS3D propio permitiría control total, pero exigiría construir y calibrar curva, recorte, reverso, sombras, drag y touch. Para esta primera reproducción, el motor seleccionado cubre mejor el comportamiento observado con menor riesgo.

## Riesgos pendientes

- Legibilidad del texto fino del PDF horizontal en teléfonos pequeños.
- Variaciones de render de `clip-path` y transforms en Safari/iOS.
- Comprobar la sensación de drag y la velocidad de asentamiento en hardware táctil real.
- Ajustar calidad WebP si aparecen artefactos en gradientes oscuros o pantallas de alta densidad.
