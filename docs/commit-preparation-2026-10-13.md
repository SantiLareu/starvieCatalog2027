# Preparación de commit — 13/10/2026

Se revisó `git status` sin hacer commit, push, deploy ni staging. El índice sigue
vacío. El [inventario completo](commit-preparation-2026-10-13.csv) clasifica
**cada una de las 277 rutas pendientes**, además de los 60 binarios
locales excluidos. No se descartó código ni una dependencia dudosa.

## Commit existente

`git log --oneline origin/main..HEAD`:

```text
b31eb42 feat(mobile): add reusable premium pages and pinch zoom
```

Es el único commit por delante de la referencia local `origin/main`. Incorpora
la plantilla premium compartida P15/P17, pinch/pan/reset y exclusión de gestos
interactivos del flip, reemplazando componentes específicos del piloto. Incluye
documentación, hero/punto dulce de Eternal y tests de regresión. Corresponde a
la implementación mobile autorizada; el working tree completa su evolución a
portrait habitual, cancha compartida, productos y editoriales aprobados.
No introduce cambios de precios, pedidos, backend ni checkout. No se consultó
la rama remota vía fetch en esta preparación ni se reescribió el historial.

## Carpetas untracked revisadas

| Carpeta | Archivos | Bytes | Decisión |
| --- | ---: | ---: | --- |
| source-assets/ | 62 | 1,351,074,034 | 59 PNG + Excel local; sólo manifiesto/README versionables |
| references/desktop/ | 3 | 7,921,212 | COMMIT: tres referencias aprobadas, fuera de runtime |
| src/assets/ | 4 | 975,450 | COMMIT: tres WebP runtime y uno histórico documentado |

MB decimales: source-assets ≈ 1.351,07 MB; references/desktop 7,92 MB;
src/assets 0,98 MB. Los binarios locales ignorados pesan **1,351,006,487 bytes**.
Conservan los 59 PNG16 originales sin destruirlos. El Excel de respaldo tampoco
necesita un duplicado versionado: el catálogo canónico y el historial ya existen.

`references/desktop/`: `padel-court-background.jpg` (foto base),
`desktop-stage-reference.png` (composición aprobada),
`padel-court-background-clean.png` (fuente sin logo para los derivados de cancha).
Son fuentes/referencias de diseño útiles y de peso razonable, no el archivo
gigante de masters de producto. Se recomienda versionar las tres.

`src/assets/desktop/`: `padel-court-clean-wide.webp` usa el stage desktop;
`padel-court-clean.webp` usa la cancha mobile; `starvie-wall-logo.webp` usa ambas
experiencias y accesorios. Son imports compilados por Vite, necesarios en una
clonación limpia. `padel-court-background.webp` (520.908 bytes) es la variante
histórica documentada con logo integrado, conservada como referencia pequeña;
no entra al bundle actual. No hay PNG16 ni masters gigantes en esta carpeta.

## Política segura de Git aplicada

```gitignore
/source-assets/*
!/source-assets/product-masters/
/source-assets/product-masters/*
!/source-assets/product-masters/manifest.json
!/source-assets/product-masters/README.md
```

Reglas ancladas y allowlist: no ignoran src/assets ni referencias aprobadas.
Se comprobó que los 60 binarios quedan ignorados y los dos metadatos quedan
visibles/versionables. La regeneración de los derivados conserva el requisito
del archivo local de masters; no se sustituyó silenciosamente por otra fuente.
El build de producción y sus checks sólo necesitan el manifiesto y los WebP ya
preparados. El test visual PNG16/WebP informa skip cuando falta el archivo local;
los tests de runtime/zoom/fallback y checks de integridad siguen obligatorios.
Es recomendable preservar un respaldo de masters fuera de Git antes de eliminar
el archivo local en el futuro. No se borró ni se trasladó ningún master ahora.

Estos PNG ya existían en commits históricos bajo public: eliminarlos del estado
actual e ignorar la copia local no elimina blobs del historial. No se propuso ni
ejecutó una reescritura de historia para reducirlo.

## Dos referencias restauradas

El borrado era preexistente al inicio de las auditorías, sin motivo autorizado
registrado. Aunque no fueran runtime, seguían siendo fuentes aprobadas:

- eternal-sweetspot.png: 34.725 bytes; fuente documentada de
  public/mobile/eternal-sweetspot.png. Copia byte idéntica, SHA-256
  e1badc461ba4045a6e75b9121aee1cb9206492e45b28e32a9afe61649517e5e0.
- raptor.png: 2.248.680 bytes; original documentado en mobile-pilot.md, base del
  hero Raptor optimizado. SHA-256
  5331c2e33468b3b6999dcafd201c089686211cd81092daabcd14501bd1ab7c97.

Se restauraron exactamente desde HEAD y verificaron por Git blob/hash. No se
confundió ausencia de consumidor runtime con permiso para borrar referencias.
Ya no aparecen como D; no necesitan una nueva adición al índice.

## Clasificación completa

- **COMMIT (277 rutas pendientes)**: fuente/config de funcionalidades
  aprobadas; WebP runtime nuevos; 59 bajas PNG en public correspondientes a
  migración/archivo local; siete recompresiones PNG8 verificadas; Excel y JSON
  sincronizados; perfiles/editoriales; referencias aprobadas; regresiones;
  docs; .gitignore; manifiesto/README livianos. Cada path figura en el CSV.
- **KEEP LOCAL / GITIGNORE (60 binarios)**: 59 masters + catalog-before.xlsx.
  También node_modules y tmp se mantienen ignorados: tmp contiene evidencia y
  fuentes de trabajo además de temporales, así que no se recomienda borrarlo
  entero. No se ignoraron assets necesarios para compilar o tests obligatorios.
- **DISCARD / TEMP**: ningún path pendiente necesita descarte. Dist,
  test-results, playwright-report, tsbuildinfo y cachés/trazas regenerables ya
  están fuera del status por .gitignore; no se borraron durante esta preparación.

Los heroes/ambient de public/hero conservan referencias explícitas en perfiles
heredados y tests; siguen clasificados COMMIT, sin retirar dependencias para
reducir artificialmente el status. Los tres cambios de commerce retiran sólo
imports sin uso, como documenta la auditoría anterior; no alteran lógica.

## Archivos de auditoría

**Versionar los cuatro**: png16-audit-2026-10-13.csv (inventario 59), .json
(mediciones), .md (decisiones y pruebas), precommit-audit-2026-10-13.md (auditoría
general anterior). Los cuatro juntos pesan 90,98 KB antes de las notas de
seguimiento. No contienen binarios de masters. Los informes históricos se
distinguen del estado final mediante una nota; dumps, trazas y capturas de tmp
no se agregan a Git. Versionar también este informe/CSV para revisar el alcance.

## Validación de esta preparación

- `git log origin/main..HEAD`: sólo b31eb42; rama main ahead 1.
- Índice vacío; no staging.
- Política Git verificada: 60 binarios ignorados; manifiesto/README visibles.
- Dos referencias restauradas idénticas al blob de HEAD; ya no aparecen D.
- `npm run check-products` y `npm run check:product-images`: aprobados.
- Tests del resolver de masters: 3 aprobados.
- Comparación visual con masters presentes: 2 proyectos aprobados, desktop y
  mobile, conservando los resultados de la auditoría anterior.
- Fixture temporal sin masters: 1 test omitido explícitamente, sin modificar
  ni mover el archivo real de masters. La prueba de ausencia no envía pedidos.
- `npm run build`: aprobado; mismos hashes de JS/CSS/escenario y artefacto
  de 440.445.482 bytes. Se conserva el warning previo de chunk >500 KB.
- `git diff --check`: aprobado, sin errores de whitespace.
No se repitió la suite entera de navegación/comercio porque no cambió la app.
La auditoría anterior dejó 496 unitarios y 51 E2E relevantes aprobados.
No se enviaron pedidos reales; no se hizo commit, push, deploy ni staging.
