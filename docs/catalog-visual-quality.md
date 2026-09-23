# Calidad visual del catálogo

## Mejora aplicada al layout

El visor ahora reserva casi todo el ancho disponible para el spread, reduce la altura del header y recorta los márgenes verticales externos. El libro conserva su relación de aspecto y el motor sigue calculando cada hoja con proporciones de 960 × 540, por lo que no hay estiramiento ni deformación.

Este cambio mejora el tamaño percibido sin modificar los assets ni el pipeline de generación.

## Resolución actual y mejora futura opcional

Las páginas actuales están renderizadas a 1920 × 1080 px. Esa resolución es suficiente para pantallas estándar porque cada hoja suele mostrarse bastante por debajo de 960 px de ancho. En pantallas grandes de alta densidad (por ejemplo, DPR 2), el visor puede llegar a necesitar aproximadamente 2200 px por hoja para conservar detalle 1:1.

Si la prioridad futura es mejorar la nitidez real en monitores Retina/4K, conviene evaluar una regeneración a 2400 o 2560 px de ancho manteniendo la misma proporción. La recomendación preferida es 2560 × 1440 px por página, acompañada por medición de peso, compresión WebP y tiempo de carga antes de reemplazar los assets actuales.

No se cambió el pipeline ni se regeneraron páginas en esta ronda. El costo esperado de subir la resolución es un mayor peso de descarga, más memoria de decodificación y una caché más grande; por eso debe tratarse como una mejora separada y medirse antes de adoptarla.
