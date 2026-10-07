#!/usr/bin/env python3
"""
Limpieza visual de precios impresos del catalogo StarVie 2027.

P15-P26 (palas, plantilla fija). Elimina de cada pagina, sobre el asset
WebP usado por la app:
  1. Pastilla "MENU" (superior derecha).
  2. Filas "P.V.P" y "STREET PRICE" de la tabla de especificaciones
     (reubica el borde inferior con chanfle bajo la fila BALANCE).
  3. Bloque "TRACKING DE VENTAS" (inferior derecha).

P28-P37 (paleteros, mochilas y neceseres, banda lateral de
especificaciones). Mascaras EXPLICITAS por pagina (GLYPH_MASKS): dos
cajas pequenas por pagina ("P.V.P." + importe), medidas sobre el original
y estrictamente dentro de su celda. Sin deteccion automatica de filas.
Cada caja se rellena interpolando sus propias columnas de borde
(validadas como fondo: nunca atraviesan lineas). Divisores, bordes,
chanfle, DIMENSIONES y MATERIALES quedan pixel-identicos (prueba de
identidad fuera de mascaras en cada apply).

P38 (accesorios, reticula 4+5). Cubre individualmente cada linea
"P.V.P: ..." con su propia mascara pequena. Sin mascara gigante: cada
caja tiene tope de tamano en codigo y debe contener firma de texto
oscuro sobre fondo claro; cualquier caja vacia, descentrada o
sobredimensionada aborta la pagina.

PROTEGIDO (abortar antes que tocar):
  - Palas: filas FORMA/PLANO/PESO/BALANCE con valores, lineas, bordes y
    chaflanes; bloque INCLUYE / ECOFRIENDLY GYMSACK y su linea horizontal.
  - P28-P37: filas DIMENSIONES/MATERIALES con valores, divisores, borde
    inferior y chanfle; nombre, REF, EAN, caracteristicas y fotos.
  - P38: pastillas de nombre, fotos de producto, titulares de seccion.
  - Siempre: nombre de producto, fotos, tecnologias, textos utiles,
    branding y hotspots (los hotspots son DOM: la limpieza solo altera
    pixeles de la imagen, nunca intercepta pointer events).

NO TOCA: PDF original (starvie-2027/), pipeline, Head.

Requisitos (Windows):  pip install pillow numpy
Uso:
  python scripts/clean-pala-pages.py --preview                 # P15-P26, solo diagnostico
  python scripts/clean-pala-pages.py --preview --pages 15      # solo P15
  python scripts/clean-pala-pages.py --preview --pages 28-38  # diagnostico bolsos/accesorios
  python scripts/clean-pala-pages.py --preview --pages 38     # solo P38
  python scripts/clean-pala-pages.py --apply                   # REAL (bloqueado sin flag)
  python scripts/clean-pala-pages.py --restore --pages 28-38  # restaura P28-P38 desde
                                                             # assets/pages-original/ y
                                                             # resincroniza catalog.json

Reglas de seguridad:
  - --preview SOLO escribe PNG anotados en tmp/clean-preview/. Nunca
    modifica public/, catalog.json ni backups. No aborta la corrida ante
    una deteccion fallida: marca FAILED/WARNING y sigue (exit 1 al final
    si hubo fallos, pero con todos los previews generados).
  - El modo real exige --apply explicito; primero VALIDA todas las paginas
    (fase deteccion) y solo si todas pasan, aplica. Aborta ante:
    sanity check critico fallido, mascara que invade la zona protegida
    (BALANCE/INCLUYE en palas, DIMENSIONES/MATERIALES en P28-P37),
    filas de precio fuera de la geometria esperada, o mascara P38 sin
    firma de texto o fuera de tamano.
  - Exige backup previo en assets/pages-original/{pages,thumbnails}/ para
    CADA pagina objetivo (incluidas P28-P38: copiar el WebP vigente antes
    del primer --apply).
  - Mantiene 1920x1080, WebP q84 en paginas y q68 en thumbnails (480px),
    igual que el pipeline (scripts/build-pdf-pages.mjs + README).
  - Actualiza "bytes"/"thumbnailBytes" de catalog.json por reemplazo
    quirurgico (sin reformatear).

Estrategia: geometria normalizada de cada plantilla como fuente de
verdad (palas). En P28-P37 las cajas son datos explicitos por pagina
(GLYPH_MASKS) validados contra los pixeles: firma de trazo dentro de cada
caja, columnas laterales de fondo liso y sin divisor vertical en la
etiqueta; el --preview dibuja exactamente las cajas que usara el apply.
La imagen tambien se usa para sanity checks de bloques a proteger y regla
INCLUYE presente (palas). No hay fallback.

Leyenda del preview: MENU rojo / TRACKING naranja / INCLUYE protegido azul /
filas precio magenta / especificaciones protegidas verde / divisores
amarillos / borde nuevo blanco / margen TRACKING-INCLUYE punteado.
En P28-P37: caja magenta 1 sobre "P.V.P." + caja magenta 2 sobre el
importe (revisar las 20 cajas antes del apply). En P38: mascaras
individuales magenta con etiqueta.
"""

import argparse
from hashlib import sha256
from io import BytesIO
import json
import os
import re
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES_DIR = os.path.join(ROOT, "public", "catalog", "pages")
THUMBS_DIR = os.path.join(ROOT, "public", "catalog", "thumbnails")
BACKUP_DIR = os.path.join(ROOT, "assets", "pages-original")
CATALOG_JSON = os.path.join(ROOT, "public", "catalog", "catalog.json")
PREVIEW_DIR = os.path.join(ROOT, "tmp", "clean-preview")

# Originales verificados contra 03ee0f7bd8ea41388db3d1b41f18e054cd87f3e3.
# Referencia estable para restore: HEAD puede contener las paginas limpias.
ORIGINAL_BACKUP_SHA256 = {
    28: {
        "pages": "a4f928573df4c9278b00cd7dc7fb9bca771a3e008a37f5a1d6f7f425421ffe16",
        "thumbnails": "9193e5ae5759d73129ad18190f739a04b726cf48961117d6954e4ddfb5a271c9",
    },
    29: {
        "pages": "9d014a992deceb23716e3f48e4c7b89644ff5ca88b7a74dbcfc2a70535a7b8ac",
        "thumbnails": "ef2d72728c8f898df5198f93575f4c55db301b1bafa67b8ae698f8dff774880e",
    },
    30: {
        "pages": "fb48243f0a65944c20406ffc8d264bfb145fe2811ecc43b2c27f0a5e9caa0ec0",
        "thumbnails": "10dd0e4f1b086aab612d78c661faa43460c018c2312977c8a12add3b808c1aec",
    },
    31: {
        "pages": "efa1078a6451f098ff7fd9230e4f18bb1d013078938daad48dc41f8a151b8e48",
        "thumbnails": "90a4821975eba77f5dac8208d5e4bf820221b60d10a8fb2eb7e71f6045e2006d",
    },
    32: {
        "pages": "d83010f556b9efc0fc3416852e80d4eed6e7ff28d08bc107b3a9db6b36952d4f",
        "thumbnails": "195cfc63c97d7891f753550f4ba49e85154177e451d04980019795414479345b",
    },
    33: {
        "pages": "8bdebdf98ccc1236fe10f16c09676c29aae172f77e9a2060e4634c0cdafa3f89",
        "thumbnails": "783d9db8cdf3eef411f9c252746e027f1a31d61ce8f561fc27abe86e4afbb1c7",
    },
    34: {
        "pages": "da57f548968f479cfdf1749ce1623dbf95f1c4b4d0fe7b804176b90a51786f35",
        "thumbnails": "e50c9605ccc7f38e6bdcd07d3d3c3de7b6e1c0bb60aaa59b910941516eb16169",
    },
    35: {
        "pages": "2e1eef29fdb7f3c9819ebaa9be3e83bb50f19d35920f29eb5d892ca88c9fec34",
        "thumbnails": "f5e8a540deead9234ca3746197d1f2a8b771124b85e48b69573987e60e5dbf4a",
    },
    36: {
        "pages": "31f2be8ad34c71ec6846ca879be46d36320d2c448393c61ed959e925777b87e8",
        "thumbnails": "e3d52f70889cb88b5f3f75aebeb859e0d1aa097269dd54e0b7533068fdf38b67",
    },
    37: {
        "pages": "7f8400c820dc0e0574003801b45b40018e0286714f6a5b38fd62775e09e3f877",
        "thumbnails": "c15b098516e247328178b72c10e3cba68a0c7e56de0e187238e36781b1367799",
    },
    38: {
        "pages": "4c46c78e3326fb1389adc99f823f04d9c968de1eb920224fd8c1e2ff59e8052f",
        "thumbnails": "6ce15a28679ad7f36c2e24d0f0b3f67f3ea48ba309087ab35753b11a586a5736",
    },
}

PAGE_W, PAGE_H = 1920, 1080
THUMB_W = 480

# P15-P26 usan una plantilla editorial fija. Estas coordenadas normalizadas
# son la fuente de verdad; la lectura de pixeles se conserva solamente como
# sanity check para impedir que el script opere sobre otra plantilla.
TEMPLATE = {
    "menu": (0.829, 0.055, 0.904, 0.102),
    "tracking": (0.738, 0.797, 0.909, 0.8824),
    "incluye": (0.573, 0.896, 0.906, 0.955),
    "incluye_rule": (0.573, 0.930, 0.814, 0.953),
    "table_x": (0.704167, 0.889583),
    "table_lines_y": (0.356481, 0.383333, 0.410185, 0.437037, 0.463889, 0.490741, 0.517593),
}

RING = 18
SANITY_BRIGHT = 95
SANITY_LINE_SPAN = 0.75
SANITY_LINE_TOL = 3
TABLE_ROWS = 6  # FORMA..STREET PRICE -> 7 lineas horizontales
TRACK_INCLUYE_MARGIN = 14  # px minimos entre mascara TRACKING y zona INCLUYE

# P28-P37: mascaras EXPLICITAS por pagina (coordenadas normalizadas sobre
# 1920x1080, medidas sobre el original de cada pagina). Dos cajas por
# pagina: texto "P.V.P." e importe, estrictamente dentro de su celda y con
# margen a todas las lineas. Sin deteccion automatica de filas.
# bags3 (P28,29,30,32,33,35,36): fila P.V.P y~543-563.
# bags4 (P31,34): tabla mas alta, fila P.V.P y~595-617.
# nec2  (P37): tabla de dos filas, fila P.V.P y~566-585.
SPEC_EDGE_THRESH = 40.0  # salto local (rango 3x3) que delata trazo de texto
SPEC_EDGE_MIN_BEFORE = 0.02  # trazo minimo en la mascara antes del fill (fail-closed)
SPEC_EDGE_MAX_RATIO = 0.35  # el trazo debe caer a este ratio tras el fill
GLYPH_MASKS = {
    # bags3: fila P.V.P y~604-624 (preview previo: las cajas y~544-564
    # caian sobre DIMENSIONES, dos filas arriba; corrimiento +60px).
    28: {"label": (0.767709, 0.5454, 0.793750, 0.5639), "value": (0.808855, 0.5454, 0.843750, 0.5639)},
    29: {"label": (0.767709, 0.5454, 0.793750, 0.5639), "value": (0.808855, 0.5454, 0.844271, 0.5639)},
    30: {"label": (0.769792, 0.5575, 0.795834, 0.5760), "value": (0.807813, 0.5575, 0.843230, 0.5760)},
    # bags4 (P31,34): tabla mas alta; revision individual ubica P.V.P en
    # y~595-617 (sin cambio: sus fallos apuntan a X, fuera de este turno).
    31: {"label": (0.769792, 0.5565, 0.795834, 0.5770), "value": (0.807813, 0.5565, 0.841667, 0.5770)},
    32: {"label": (0.767709, 0.5454, 0.793750, 0.5639), "value": (0.807813, 0.5454, 0.842709, 0.5639)},
    33: {"label": (0.767709, 0.5454, 0.793750, 0.5639), "value": (0.807813, 0.5454, 0.842188, 0.5639)},
    34: {"label": (0.769792, 0.5565, 0.795834, 0.5770), "value": (0.807813, 0.5565, 0.843230, 0.5770)},
    35: {"label": (0.767709, 0.5454, 0.793750, 0.5639), "value": (0.807813, 0.5454, 0.842709, 0.5639)},
    36: {"label": (0.769792, 0.5575, 0.795834, 0.5760), "value": (0.807813, 0.5575, 0.842188, 0.5760)},
    # nec2 (P37): tabla de dos filas; P.V.P y~564-584 (micro-ajuste -2px).
    37: {"label": (0.767709, 0.5260, 0.793750, 0.5445), "value": (0.807813, 0.5260, 0.839063, 0.5445)},
}

# P38 (accesorios): una caja por linea de precio visible, coordenadas
# normalizadas sobre 1920x1080 (estimadas: validar en --preview).
# Cada caja cubre la linea completa "P.V.P: ..." sin tocar pastillas,
# fotos ni titulares. Topes anti-mascara-gigante en P38_MAX_W/H.
P38_MASKS = (
    ("black cap", (0.066, 0.484, 0.142, 0.510)),  # P.V.P: 13,00
    ("power balance", (0.279, 0.484, 0.355, 0.510)),  # P.V.P: 13,99
    ("premier soft", (0.488, 0.484, 0.563, 0.510)),  # P.V.P: 95,00
    ("tacky touch", (0.642, 0.484, 0.7162, 0.510)),  # P.V.P: 70,00
    # NOTA: en la fila inferior solo hay 4 lineas visibles para 5
    # productos; "6,99" queda entre las columnas White y Blue. La mascara
    # cubre el texto tal como esta impreso; el --preview debe confirmar
    # que no exista una quinta linea (p. ej. de Blue) fuera de estas cajas.
    ("wristband white/blue 6,99", (0.154, 0.9130, 0.223, 0.9380)),
    ("wristband black x2", (0.392, 0.9130, 0.459, 0.9380)),  # P.V.P: 7,25
    ("protector transparent carbon", (0.553, 0.9130, 0.621, 0.9380)),  # 5,00
    ("key ring", (0.762, 0.9130, 0.842188, 0.9380)),  # P.V.P: 89,99
)
P38_MAX_W = 0.10  # ninguna mascara P38 puede superar el 10% del ancho
P38_MAX_H = 0.04  # ... ni el 4% del alto (prohibe mascaras gigantes)
P38_DARK = 100  # precios P38: texto oscuro sobre fondo claro
P38_LIGHT_MEAN = 150  # la caja debe estar sobre fondo claro, no sobre foto

# Validacion de mascaras explicitas P28-P38: cada caja debe contener texto
# (firma de trazo) y sus columnas laterales deben ser fondo liso (margen a
# lineas). GLYPH_EDGE_TOL es el rango maximo admitido en esas columnas.
GLYPH_EDGE_TOL = 25.0  # rango maximo en las columnas de interpolacion (fondo)
GLYPH_VLINE_FRAC = 0.85  # techo de columna brillante (descarta divisor vertical)
GLYPH_VLINE_BRIGHT = 200.0  # brillo a partir del cual cuenta como trazo/linea
IDENTITY_PAD = 4  # margen alrededor de cajas para la prueba de identidad


def frac_to_px(box):
    x0, y0, x1, y1 = box
    return (int(x0 * PAGE_W), int(y0 * PAGE_H), int(x1 * PAGE_W), int(y1 * PAGE_H))


def _box_blur_axis(m, radius, axis):
    """Un pase de promedio de caja sobre un eje, con indices seguros.

    Construye el prefijo EXCLUSIVO con padding explicito (fila/columna
    cero inicial real, longitud n+1): cada salida i promedia la ventana
    [i-radius, i+radius] intersectada con [0, n-1], normalizada por su
    area REAL (completa adentro, recortada en bordes). Sin OOB, sin
    desplazamiento, mismo tamaño.
    """
    moved = np.moveaxis(m, axis, 0)  # (N, ...)
    n = moved.shape[0]
    flat = moved.reshape(n, -1)
    pref = np.zeros((n + 1, flat.shape[1]), dtype=np.float64)
    pref[1:] = np.cumsum(flat, axis=0)
    idx = np.arange(n)
    # Ventana exclusiva [lo, hi); ambos acotados a [0, n], validos en pref.
    lo = np.clip(idx - radius, 0, n)
    hi = np.clip(idx + radius + 1, 0, n)
    sums = pref[hi] - pref[lo]
    counts = (hi - lo).astype(np.float64)[:, None]
    out = sums / np.maximum(counts, 1.0)
    return np.moveaxis(out.reshape(moved.shape), 0, axis)


def box_blur(mask, radius, iters=3):
    """Blur por promedios de caja separables, seguro en bordes."""
    m = mask.astype(np.float64)
    if radius < 1 or iters < 1:
        return m.astype(np.float32)
    for _ in range(iters):
        m = _box_blur_axis(m, radius, axis=1)
        m = _box_blur_axis(m, radius, axis=0)
    return m.astype(np.float32)


def template_box(name):
    """Convierte una caja normalizada de la plantilla a pixeles."""
    return frac_to_px(TEMPLATE[name])


def side_interpolate_fill(img, bbox, sample=RING, feather=8):
    """Reconstruye un fondo suave usando tiras laterales de la misma fila.

    Es deliberadamente local: MENU, TRACKING y la tabla estan sobre un
    degradado horizontal suave. La mediana lateral evita que texto claro o
    ruido WebP domine la muestra, y conserva el gradiente rojo inferior.
    """
    x0, y0, x1, y1 = bbox
    h, w = img.shape[:2]
    if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
        raise RuntimeError(f"caja fuera de pagina: {bbox}")
    lx0, lx1 = max(0, x0 - sample), x0
    rx0, rx1 = x1, min(w, x1 + sample)
    if lx1 - lx0 < 4 or rx1 - rx0 < 4:
        raise RuntimeError(f"muestras laterales insuficientes para {bbox}")

    left = np.median(img[y0:y1, lx0:lx1].astype(np.float32), axis=1)
    right = np.median(img[y0:y1, rx0:rx1].astype(np.float32), axis=1)
    t = np.linspace(0.0, 1.0, x1 - x0, dtype=np.float32)[None, :, None]
    patch = left[:, None, :] * (1.0 - t) + right[:, None, :] * t
    rebuilt = img.copy()
    rebuilt[y0:y1, x0:x1] = np.clip(patch, 0, 255).astype(np.uint8)
    if feather <= 0:
        return rebuilt
    mask = np.zeros((h, w), dtype=np.float32)
    mask[y0:y1, x0:x1] = 1.0
    mask = box_blur(mask, feather, iters=2)
    out = img.astype(np.float32) * (1.0 - mask[..., None]) + rebuilt.astype(np.float32) * mask[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def _clusters(flags, max_gap=2):
    runs, start = [], None
    for i, flag in enumerate(flags):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(flags) - 1))
    merged = []
    for a, b in runs:
        if merged and a - merged[-1][1] <= max_gap:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]


def _expected_table_geometry():
    tx0 = int(round(TEMPLATE["table_x"][0] * PAGE_W))
    tx1 = int(round(TEMPLATE["table_x"][1] * PAGE_W))
    lines = [int(round(v * PAGE_H)) for v in TEMPLATE["table_lines_y"]]
    return tx0, tx1, lines


def detect_table(gray):
    """Valida, pero no decide, la geometria fija de la tabla.

    Busca cada divisor solo a +/-3px de su ancla esperada. Esto detecta una
    pagina equivocada o un template desplazado sin volver a depender de los
    bordes verticales (la tabla ni siquiera tiene borde izquierdo continuo).
    """
    tx0, tx1, expected = _expected_table_geometry()
    lines, scores = [], []
    for target in expected:
        candidates = []
        for y in range(target - SANITY_LINE_TOL, target + SANITY_LINE_TOL + 1):
            score = float((gray[y, tx0:tx1] > SANITY_BRIGHT).mean())
            candidates.append((score, -abs(y - target), y))
        score, _, y = max(candidates)
        if score < SANITY_LINE_SPAN:
            raise RuntimeError(
                f"tabla fuera de template: divisor esperado y={target}, score={score:.3f}"
            )
        lines.append(y)
        scores.append(score)
    if len(set(lines)) != TABLE_ROWS + 1:
        raise RuntimeError(f"tabla: divisores ambiguos {lines}")
    bands = [b - a for a, b in zip(lines, lines[1:])]
    if any(abs(b - 29) > 2 for b in bands):
        raise RuntimeError(f"tabla: separacion inesperada {bands}")
    for idx, label in ((4, "P.V.P"), (5, "STREET PRICE")):
        band = gray[lines[idx] + 2 : lines[idx + 1] - 1, tx0:tx1]
        frac = float((band > 140).mean())
        if not (0.02 <= frac <= 0.50):
            raise RuntimeError(f"tabla: banda {label} sin firma de texto (frac={frac:.3f})")
    return {
        "x": (tx0, tx1),
        "lines": lines,
        "line_scores": scores,
        "keep": (tx0, lines[0], tx1, lines[4]),
        "protected_specs": (tx0, lines[0], tx1 - 16, lines[4]),
        "pvp_band": (tx0, lines[4], tx1, lines[5]),
        "street_band": (tx0, lines[5], tx1, lines[6]),
        "fill_band": (tx0, lines[4] + 1, tx1 + 1, lines[6] + 3),
        "chamfer_src": (tx1 - 15, lines[6] - 13, tx1 + 2, lines[6] + 3),
        "chamfer_dst": (tx1 - 15, lines[4] - 13, tx1 + 2, lines[4] + 3),
    }


def _bright_frac(gray, box, threshold):
    """Fraccion de pixeles claros en una caja (firma de texto claro)."""
    x0, y0, x1, y1 = box
    return float((gray[y0:y1, x0:x1] > threshold).mean())


def _dark_frac(gray, box, threshold):
    """Fraccion de pixeles oscuros en una caja (texto oscuro P38)."""
    x0, y0, x1, y1 = box
    return float((gray[y0:y1, x0:x1] < threshold).mean())


def _edge_frac(gray, box):
    """Fraccion de pixeles con trazo (rango 3x3 > SPEC_EDGE_THRESH).

    Mide contenido de texto por contraste LOCAL, no por brillo absoluto:
    vale igual sobre fondo oscuro (palas) que sobre gris claro/degradado
    (banda P28-P37), donde un umbral de brillo contaria fondo legitimo.
    La ventana 3x3 erosiona 1px el borde de la caja: el posible escalon del
    reemplazo (fill con feather=0) y el aliasing de divisores vecinos no
    entran en la medida.
    """
    x0, y0, x1, y1 = (int(v) for v in box)
    region = gray[y0:y1, x0:x1].astype(np.float32)
    h, w = region.shape
    if h < 3 or w < 3:
        raise RuntimeError(f"caja demasiado pequena para medir trazo: {box}")
    win = np.stack(
        [region[dy : dy + h - 2, dx : dx + w - 2] for dy in range(3) for dx in range(3)]
    )
    inner = win.max(axis=0) - win.min(axis=0)
    return float((inner > SPEC_EDGE_THRESH).mean())


def _require_clean_edges(gray, box, context):
    """Cada borde debe ser localmente uniforme, sin mezclar ambos lados.

    Valida 2 columnas interiores + 2 exteriores adyacentes por lado.
    La referencia exterior detecta un borde uniforme situado sobre un
    trazo; los niveles de gris izquierdo/derecho pueden diferir por el
    degradado. Sin muestras completas se aborta antes de escribir.
    """
    x0, y0, x1, y1 = (int(v) for v in box)
    height, width = gray.shape
    if not (2 <= x0 and x0 + 2 <= x1 - 2 and x1 + 2 <= width
            and 0 <= y0 < y1 <= height):
        raise RuntimeError(
            f"{context}: muestras locales de borde incompletas en {box} "
            "(requiere 2 columnas interiores y 2 exteriores por lado)"
        )
    for side, edge in (
        ("izquierdo", gray[y0:y1, x0 - 2 : x0 + 2]),
        ("derecho", gray[y0:y1, x1 - 2 : x1 + 2]),
    ):
        edge = edge.astype(np.float32)
        spread = float(edge.max() - edge.min())
        if spread > GLYPH_EDGE_TOL:
            raise RuntimeError(
                f"{context}: borde {side} de mascara contaminado en {box} "
                f"(rango={spread:.1f} > {GLYPH_EDGE_TOL}): la caja toca texto o linea"
            )


def _require_no_vline(gray, box, context):
    """Ninguna columna de la caja puede ser un trazo vertical continuo.

    Detecta un divisor vertical tragado por la caja: linea brillante de
    altura completa. Los glifos ("P.V.P.", importes) nunca tienen fustes
    tan altos (P~0.7); solo se aplica donde no hay digito "1".
    """
    x0, y0, x1, y1 = (int(v) for v in box)
    cols = (gray[y0:y1, x0:x1].astype(np.float32) > GLYPH_VLINE_BRIGHT).mean(axis=0)
    peak = float(cols.max())
    if peak > GLYPH_VLINE_FRAC:
        xi = int(cols.argmax()) + x0
        raise RuntimeError(
            f"{context}: posible divisor vertical dentro de {box} "
            f"(columna x={xi} brillante en {peak:.2f} > {GLYPH_VLINE_FRAC})"
        )


def edge_interpolate_fill(img, box):
    """Rellena la caja interpolando sus propias columnas de borde.

    Muestras locales que nunca atraviesan lineas: la interpolacion es por
    fila entre la mediana de las 2 columnas izquierdas y las 2 derechas
    (validadas como fondo por _require_clean_edges). Reemplazo duro
    (feather=0, como la tabla de palas): sobre degradado suave no deja
    costura y no esparce nada fuera de la caja.
    """
    x0, y0, x1, y1 = (int(v) for v in box)
    h_img, w_img = img.shape[:2]
    if not (0 <= x0 < x0 + 2 <= x1 - 2 < x1 <= w_img and 0 <= y0 < y1 <= h_img):
        raise RuntimeError(f"caja invalida para relleno de bordes: {box}")
    region = img[y0:y1, x0:x1].astype(np.float32)
    left = np.median(region[:, 0:2, :], axis=1)
    right = np.median(region[:, -2:, :], axis=1)
    t = np.linspace(0.0, 1.0, x1 - x0, dtype=np.float32)[None, :, None]
    patch = left[:, None, :] * (1.0 - t) + right[:, None, :] * t
    out = img.copy()
    out[y0:y1, x0:x1] = np.clip(patch, 0, 255).astype(np.uint8)
    return out


def _assert_outside_identical(out, original, boxes, context, pad=IDENTITY_PAD):
    """Garantia fuerte: fuera de las mascaras (+margen), pixel-identico.

    Prueba independiente de la deteccion: aunque las cajas estuvieran
    desplazadas, ningun pixel fuera de ellas puede cambiar. Si el relleno
    esparciera algo inesperado, aborta (fail-closed, no se restaura nada).
    """
    h, w = original.shape[:2]
    keep = np.ones((h, w), dtype=bool)
    for x0, y0, x1, y1 in boxes:
        keep[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad] = False
    if not np.array_equal(out[keep], original[keep]):
        bad = int((out[keep] != original[keep]).any(axis=-1).sum())
        raise RuntimeError(
            f"{context}: {bad}px fuera de mascaras cambiaron "
            "(garantia de identidad violada)"
        )


def detect_bags_plan(page_num, name, src, img, arr, gray):
    """Plan P28-P37: dos mascaras explicitas (P.V.P + importe) por pagina.

    Sin deteccion automatica de filas: las cajas salen de GLYPH_MASKS y se
    validan contra los pixeles (firma de trazo dentro, bordes limpios,
    sin divisor vertical en la etiqueta). Todo lo demas queda intacto por
    la prueba de identidad de apply.
    """
    if page_num not in GLYPH_MASKS:
        raise RuntimeError(f"P{page_num:02d}: sin mascaras explicitas P28-P37")
    ctx = f"P{page_num:02d} [glyph]"
    glyphs = []
    for tag in ("label", "value"):
        box = frac_to_px(GLYPH_MASKS[page_num][tag])
        x0, y0, x1, y1 = box
        if not (0 <= x0 < x1 <= PAGE_W and 0 <= y0 < y1 <= PAGE_H):
            raise RuntimeError(f"{ctx} [{tag}]: caja fuera de pagina {box}")
        if _edge_frac(gray, box) < SPEC_EDGE_MIN_BEFORE:
            raise RuntimeError(
                f"{ctx} [{tag}]: sin firma de texto en {box} "
                "(la caja no cubre el precio)"
            )
        _require_clean_edges(gray, box, f"{ctx} [{tag}]")
        if tag == "label":
            # "P.V.P." no tiene digito "1": un fuste vertical completo aqui
            # solo puede ser el divisor de columna tragado por la caja.
            _require_no_vline(gray, box, f"{ctx} [{tag}]")
        glyphs.append((tag, box))
    if glyphs[0][1][2] > glyphs[1][1][0]:
        raise RuntimeError(f"{ctx}: cajas solapadas {glyphs}")
    return {
        "kind": "bags",
        "page": page_num,
        "template": "glyph",
        "name": name,
        "src": src,
        "img": img,
        "arr": arr,
        "glyphs": glyphs,
        "warnings": [],
    }


def detect_p38_plan(page_num, name, src, img, arr, gray):
    """Plan P38: una mascara pequena por linea de precio, todas validadas.

    Fallar cerrado: cada caja debe (1) respetar los topes de tamano
    anti-mascara-gigante, (2) estar sobre fondo claro (no sobre foto de
    producto) y (3) contener firma de texto oscuro. Las cajas no pueden
    solaparse entre si.
    """
    boxes = []
    for label, frac in P38_MASKS:
        x0, y0, x1, y1 = frac_to_px(frac)
        w = (x1 - x0) / PAGE_W
        h = (y1 - y0) / PAGE_H
        if w > P38_MAX_W or h > P38_MAX_H:
            raise RuntimeError(
                f"P38 [{label}]: caja {w:.3f}x{h:.3f} supera el tope "
                f"({P38_MAX_W}x{P38_MAX_H}): prohibida mascara gigante"
            )
        mean = float(gray[y0:y1, x0:x1].mean())
        if mean < P38_LIGHT_MEAN:
            raise RuntimeError(
                f"P38 [{label}]: fondo medio {mean:.1f} < {P38_LIGHT_MEAN} "
                "(la caja no esta sobre fondo claro)"
            )
        frac_dark = _dark_frac(gray, (x0, y0, x1, y1), P38_DARK)
        if not (0.02 <= frac_dark <= 0.50):
            raise RuntimeError(
                f"P38 [{label}]: sin firma de texto "
                f"(frac_oscura={frac_dark:.3f})"
            )
        _require_clean_edges(gray, (x0, y0, x1, y1), f"P38 [{label}]")
        boxes.append((label, (x0, y0, x1, y1)))
    for i, (la, a) in enumerate(boxes):
        for lb, b in boxes[i + 1 :]:
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                raise RuntimeError(f"P38: mascaras solapadas [{la}] / [{lb}]")
    return {
        "kind": "p38",
        "page": page_num,
        "name": name,
        "src": src,
        "img": img,
        "arr": arr,
        "masks": boxes,
        "warnings": [],
    }


def sanity_check_template(gray, table):
    """Comprueba presencia de los bloques esperados antes de modificar."""
    checks = (
        ("MENU", template_box("menu"), 180, 0.12),
        ("TRACKING", template_box("tracking"), 140, 0.015),
        ("INCLUYE/ECOFRIENDLY", template_box("incluye"), 120, 0.008),
    )
    for label, box, threshold, minimum in checks:
        x0, y0, x1, y1 = box
        frac = float((gray[y0:y1, x0:x1] > threshold).mean())
        if frac < minimum:
            raise RuntimeError(f"{label} fuera de template (firma={frac:.3f})")
    rx0, ry0, rx1, ry1 = template_box("incluye_rule")
    rule_score = float((gray[ry0:ry1, rx0:rx1] > 75).mean(axis=1).max())
    if rule_score < 0.70:
        raise RuntimeError(f"regla INCLUYE fuera de template (score={rule_score:.3f})")
    return rule_score


def detect_page(page_num, strict):
    """Fase deteccion (sin escribir): devuelve el plan o lanza RuntimeError.

    strict=True (modo real): cualquier violacion de margen aborta.
    strict=False (preview): las violaciones de margen quedan como warnings
    en plan["warnings"]; un sanity check de template fallido siempre aborta.
    """
    name = f"page-{page_num:02d}.webp"
    src = os.path.join(PAGES_DIR, name)
    for backup in (
        os.path.join(BACKUP_DIR, "pages", name),
        os.path.join(BACKUP_DIR, "thumbnails", name),
    ):
        if not os.path.isfile(backup):
            raise RuntimeError(f"falta backup obligatorio: {backup}")
    img = Image.open(src).convert("RGB")
    if img.size != (PAGE_W, PAGE_H):
        raise RuntimeError(f"{name}: dimensiones {img.size}, se esperaban {(PAGE_W, PAGE_H)}")
    arr = np.asarray(img)
    gray = arr.mean(axis=2)

    if 28 <= page_num <= 37:
        return detect_bags_plan(page_num, name, src, img, arr, gray)
    if page_num == 38:
        return detect_p38_plan(page_num, name, src, img, arr, gray)
    if not (15 <= page_num <= 26):
        raise RuntimeError(
            f"P{page_num:02d}: fuera de las plantillas permitidas P15-P26, P28-P38"
        )
    menu_box = template_box("menu")
    track_box = template_box("tracking")
    incluye_box = template_box("incluye")
    warnings = []
    table = detect_table(gray)
    rule_score = sanity_check_template(gray, table)
    rule_y = int(round(0.940741 * PAGE_H))
    gap = incluye_box[1] - track_box[3]
    if gap < TRACK_INCLUYE_MARGIN:
        msg = (
            f"mascara TRACKING (y1={track_box[3]}) a {gap}px de INCLUYE "
            f"(y={incluye_box[1]}, minimo {TRACK_INCLUYE_MARGIN})"
        )
        if strict:
            raise RuntimeError(msg)
        warnings.append("WARNING margen TRACKING/INCLUYE: " + msg)

    # La reconstruccion comienza debajo del divisor de BALANCE.
    if table["fill_band"][1] <= table["keep"][3]:
        raise RuntimeError("mascara de tabla invade la region BALANCE")

    return {
        "kind": "pala",
        "page": page_num,
        "name": name,
        "src": src,
        "img": img,
        "arr": arr,
        "menu_box": menu_box,
        "track_box": track_box,
        "incluye_box": incluye_box,
        "rule_y": rule_y,
        "incluye_method": "template + sanity check",
        "rule_score": rule_score,
        "gap": gap,
        "warnings": warnings,
        "table": table,
    }


def annotate_spec_preview(plan):
    """PNG diagnostico P28-P37: las 2 cajas explicitas, nada mas.

    Sin deteccion: dibuja exactamente las cajas de GLYPH_MASKS que usara
    el apply (magenta 1 = P.V.P., magenta 2 = importe). Todo lo demas debe
    verse intacto: es la revision visual previa al apply.
    """
    n = plan["page"]
    canvas = plan["img"].convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    for i, (tag, box) in enumerate(plan["glyphs"]):
        x0, y0, x1, y1 = box
        draw.rectangle(box, outline=(255, 0, 255, 255), width=3,
                       fill=(255, 0, 255, 40))
        draw.text((x0, max(4, y0 - 26)), f"ELIMINAR {i + 1}: {tag}",
                  fill=(255, 0, 255, 255), font=font)
    for i, warning in enumerate(plan["warnings"]):
        draw.text((16, PAGE_H - 28 * (len(plan["warnings"]) - i) - 8),
                  warning[:150], fill=(255, 255, 0, 255), font=font)

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out_path = os.path.join(PREVIEW_DIR, f"page-{n:02d}.png")
    Image.alpha_composite(canvas, overlay).convert("RGB").save(out_path)
    return out_path


def annotate_p38_preview(plan):
    """PNG diagnostico P38: una caja magenta por precio, con etiqueta."""
    n = plan["page"]
    canvas = plan["img"].convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 20)
    except OSError:
        font = ImageFont.load_default()

    for label, box in plan["masks"]:
        x0, y0, x1, y1 = box
        draw.rectangle(box, outline=(255, 0, 255, 255), width=3,
                       fill=(255, 0, 255, 34))
        draw.text((x0, max(4, y0 - 24)), f"ELIMINAR: {label}",
                  fill=(255, 0, 255, 255), font=font)
    draw.text((16, 16), f"P{n:02d}: {len(plan['masks'])} mascaras "
              "individuales (sin mascara gigante)",
              fill=(255, 255, 255, 255), font=font)
    for i, warning in enumerate(plan["warnings"]):
        draw.text((16, PAGE_H - 28 * (len(plan["warnings"]) - i) - 8),
                  warning[:150], fill=(255, 255, 0, 255), font=font)

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out_path = os.path.join(PREVIEW_DIR, f"page-{n:02d}.png")
    Image.alpha_composite(canvas, overlay).convert("RGB").save(out_path)
    return out_path


def diagnostic_masks_plan(page_num):
    """Plan SOLO-VISUAL para --preview P28-P38: cajas explicitas sin validar.

    Carga la pagina vigente y convierte GLYPH_MASKS / P38_MASKS a pixeles.
    No ejecuta validacion de bordes, ni fill, ni firma de texto, ni
    deteccion de filas ni clustering. No modifica public/ ni catalog.json:
    solo alimenta al anotador del preview. --apply sigue usando
    detect_page con todas sus validaciones (fail-closed intacto).
    """
    name = f"page-{page_num:02d}.webp"
    img = Image.open(os.path.join(PAGES_DIR, name)).convert("RGB")
    if img.size != (PAGE_W, PAGE_H):
        raise RuntimeError(f"{name}: dimensiones {img.size}, se esperaban {(PAGE_W, PAGE_H)}")
    if page_num == 38:
        return {
            "kind": "p38",
            "page": page_num,
            "img": img,
            "masks": [(label, frac_to_px(frac)) for label, frac in P38_MASKS],
            "warnings": [],
        }
    if page_num not in GLYPH_MASKS:
        raise RuntimeError(f"P{page_num:02d}: sin mascaras explicitas P28-P37")
    return {
        "kind": "bags",
        "page": page_num,
        "img": img,
        "glyphs": [
            ("label", frac_to_px(GLYPH_MASKS[page_num]["label"])),
            ("value", frac_to_px(GLYPH_MASKS[page_num]["value"])),
        ],
        "warnings": [],
    }


def annotate_preview(plan):
    """PNG diagnostico con mascaras, protecciones y geometria. Solo preview."""
    if plan.get("kind") == "bags":
        return annotate_spec_preview(plan)
    if plan.get("kind") == "p38":
        return annotate_p38_preview(plan)
    n = plan["page"]
    canvas = plan["img"].convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    tx0, tx1 = plan["table"]["x"]
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    def labeled_box(box, text, color, fill_alpha=34, label_above=True):
        x0, y0, x1, y1 = box
        draw.rectangle(box, outline=color + (255,), width=4, fill=color + (fill_alpha,))
        label_y = max(4, y0 - 30) if label_above else min(PAGE_H - 28, y1 + 4)
        text_box = draw.textbbox((x0, label_y), text, font=font)
        draw.rectangle((text_box[0] - 5, text_box[1] - 3, text_box[2] + 5, text_box[3] + 3), fill=(0, 0, 0, 210))
        draw.text((x0, label_y), text, fill=color + (255,), font=font)

    def tag(xy, text, color):
        text_box = draw.textbbox(xy, text, font=font)
        draw.rectangle((text_box[0] - 5, text_box[1] - 3, text_box[2] + 5, text_box[3] + 3), fill=(0, 0, 0, 210))
        draw.text(xy, text, fill=color + (255,), font=font)

    # 5. Region protegida FORMA..BALANCE (verde).
    labeled_box(plan["table"]["keep"], "PROTEGER: FORMA / PLANO / PESO / BALANCE", (0, 255, 80))
    # 6. Lineas de tabla detectadas (amarillo).
    for y in plan["table"]["lines"]:
        draw.line([(tx0, y), (tx1, y)], fill=(255, 230, 0, 255), width=2)
    # 4. Filas exactas de precio (magenta).
    draw.rectangle(plan["table"]["pvp_band"], outline=(255, 0, 255, 255), width=4, fill=(255, 0, 255, 34))
    draw.rectangle(plan["table"]["street_band"], outline=(255, 55, 190, 255), width=4, fill=(255, 55, 190, 34))
    tag((1125, plan["table"]["pvp_band"][1] + 2), "ELIMINAR P.V.P  ->", (255, 0, 255))
    tag((1070, plan["table"]["street_band"][1] + 2), "ELIMINAR STREET PRICE  ->", (255, 55, 190))
    # 7. Borde inferior nuevo (blanco).
    edge_y = plan["table"]["lines"][4]
    draw.line([(tx0, edge_y), (tx1 - 11, edge_y), (tx1, edge_y - 11)], fill=(255, 255, 255, 255), width=4)
    draw.text((tx0, plan["table"]["lines"][6] + 8), "NUEVO BORDE INFERIOR (sube bajo BALANCE)", fill=(255, 255, 255, 255), font=font)
    # 1. MENU exacto (rojo).
    mx0, my0, mx1, my1 = plan["menu_box"]
    labeled_box(plan["menu_box"], "ELIMINAR: MENU", (255, 40, 40))
    # 2. TRACKING exacto (naranja).
    gx0, gy0, gx1, gy1 = plan["track_box"]
    labeled_box(plan["track_box"], f"ELIMINAR: TRACKING (margen seguro {plan['gap']} px)", (255, 150, 0))
    # 3. INCLUYE protegido (azul) + regla (cian gruesa) + metodo + margen.
    labeled_box(plan["incluye_box"], "PROTEGER: INCLUYE / ECOFRIENDLY GYMSACK", (0, 150, 255), label_above=False)
    draw.line(
        [(plan["incluye_box"][0], plan["rule_y"]), (plan["incluye_box"][2], plan["rule_y"])],
        fill=(0, 255, 255, 255),
        width=3,
    )
    # Margen de seguridad TRACKING -> INCLUYE (linea punteada + medida).
    gy1, iy0 = plan["track_box"][3], plan["incluye_box"][1]
    mid = (gy1 + iy0) // 2
    for x in range(plan["track_box"][0], plan["incluye_box"][2], 8):
        draw.line((x, mid, min(x + 4, plan["incluye_box"][2]), mid), fill=(0, 255, 0, 255), width=2)
    # Warnings del plan (amarillo, esquina inferior izquierda).
    for i, warning in enumerate(plan["warnings"]):
        draw.text((16, PAGE_H - 28 * (len(plan["warnings"]) - i) - 8), warning[:150], fill=(255, 255, 0, 255), font=font)

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out_path = os.path.join(PREVIEW_DIR, f"page-{n:02d}.png")
    Image.alpha_composite(canvas, overlay).convert("RGB").save(out_path)
    return out_path


def annotate_failed(page_num, message):
    """Preview de fallo: imagen original + banner FAILED. Solo preview."""
    name = f"page-{page_num:02d}.webp"
    img = Image.open(os.path.join(PAGES_DIR, name)).convert("RGB")
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, PAGE_W, 44], fill=(180, 0, 0))
    draw.text((16, 12), f"P{page_num:02d} FAILED: {message[:160]}", fill=(255, 255, 255))
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    out_path = os.path.join(PREVIEW_DIR, f"page-{page_num:02d}.png")
    img.save(out_path)
    return out_path


def apply_plan(plan):
    """Ejecuta un plan validado. SOLO modo real (--apply)."""
    if plan.get("kind") == "bags":
        return apply_spec_plan(plan)
    if plan.get("kind") == "p38":
        return apply_p38_plan(plan)
    return apply_pala_plan(plan)


def apply_pala_plan(plan):
    """Ejecuta un plan validado de palas. SOLO modo real (--apply)."""
    table = plan["table"]
    original = plan["arr"]
    out = side_interpolate_fill(original, plan["menu_box"], feather=6)
    out = side_interpolate_fill(out, plan["track_box"], feather=5)

    # Borra las dos filas de precio con muestras laterales de la misma y.
    # No se difumina: el borde superior existente queda pixel-perfect.
    out = side_interpolate_fill(out, table["fill_band"], sample=24, feather=0)

    # El borde inferior original tiene el chaflan correcto. Se limpia la
    # esquina destino y se trasplantan SOLO los pixeles claros del borde,
    # no el fondo ni texto, desplazandolos bajo BALANCE.
    out = side_interpolate_fill(out, table["chamfer_dst"], sample=20, feather=0)
    sx0, sy0, sx1, sy1 = table["chamfer_src"]
    dx0, dy0, dx1, dy1 = table["chamfer_dst"]
    src_patch = original[sy0:sy1, sx0:sx1]
    border_mask = src_patch.mean(axis=2) > 55
    dst_patch = out[dy0:dy1, dx0:dx1].copy()
    dst_patch[border_mask] = src_patch[border_mask]
    out[dy0:dy1, dx0:dx1] = dst_patch

    # Protecciones duras: el contenido de especificaciones y el bloque
    # INCLUYE deben ser identicos antes de la recompresion WebP.
    for label, box in (
        ("FORMA/PLANO/PESO/BALANCE", table["protected_specs"]),
        ("INCLUYE/ECOFRIENDLY", plan["incluye_box"]),
    ):
        x0, y0, x1, y1 = box
        if not np.array_equal(out[y0:y1, x0:x1], original[y0:y1, x0:x1]):
            raise RuntimeError(f"verificacion de proteccion fallo: {label}")

    # Las firmas claras eliminadas deben caer de manera marcada.
    for label, box, threshold, ratio in (
        ("MENU", plan["menu_box"], 180, 0.20),
        ("TRACKING", plan["track_box"], 140, 0.30),
        ("precios", table["fill_band"], 140, 0.35),
    ):
        x0, y0, x1, y1 = box
        before = int((original[y0:y1, x0:x1].mean(axis=2) > threshold).sum())
        after = int((out[y0:y1, x0:x1].mean(axis=2) > threshold).sum())
        if before == 0 or after > before * ratio:
            raise RuntimeError(f"limpieza insuficiente en {label}: {before} -> {after} pixeles claros")

    _write_outputs(out, plan)


def apply_spec_plan(plan):
    """Ejecuta un plan validado P28-P37. SOLO modo real (--apply)."""
    original = plan["arr"]
    ctx = f"P{plan['page']:02d} [{plan['template']}]"

    # Relleno quirurgico por caja explicita: solo texto, nunca lineas.
    out = original
    for tag, box in plan["glyphs"]:
        out = edge_interpolate_fill(out, box)

    # Firma de trazo eliminada en CADA caja (contraste local, no brillo
    # absoluto: el gris de la banda contaria fondo legitimo).
    gray_before = original.mean(axis=2)
    gray_after = out.mean(axis=2)
    for tag, box in plan["glyphs"]:
        x0, y0, x1, y1 = box
        before = _edge_frac(gray_before, box)
        after = _edge_frac(gray_after, box)
        area = (x1 - x0 - 2) * (y1 - y0 - 2)  # medida erosionada (ver _edge_frac)
        if before < SPEC_EDGE_MIN_BEFORE or after > before * SPEC_EDGE_MAX_RATIO:
            raise RuntimeError(
                f"{ctx} limpieza de trazo insuficiente [{tag}] en {box}: "
                f"before={before * area:.0f}px ({before:.3f}) -> "
                f"after={after * area:.0f}px ({after:.3f}), "
                f"limite before>={SPEC_EDGE_MIN_BEFORE} y "
                f"after<=before*{SPEC_EDGE_MAX_RATIO}"
            )

    # Garantia fuerte: fuera de las mascaras, pixel-identico al original.
    _assert_outside_identical(
        out, original, [box for _, box in plan["glyphs"]], ctx
    )

    _write_outputs(out, plan)


def apply_p38_plan(plan):
    """Ejecuta un plan validado P38. SOLO modo real (--apply)."""
    original = plan["arr"]
    ctx = f"P{plan['page']:02d} [p38]"

    # Relleno quirurgico por caja: solo texto, con sus propias columnas.
    out = original
    for label, box in plan["masks"]:
        out = edge_interpolate_fill(out, box)

    # Cada firma oscura eliminada debe caer de manera marcada.
    for label, box in plan["masks"]:
        x0, y0, x1, y1 = box
        before = int((original[y0:y1, x0:x1].mean(axis=2) < P38_DARK).sum())
        after = int((out[y0:y1, x0:x1].mean(axis=2) < P38_DARK).sum())
        if before == 0 or after > before * 0.35:
            raise RuntimeError(
                f"limpieza insuficiente en P38 [{label}] en {box}: "
                f"{before} -> {after} pixeles oscuros"
            )

    # Garantia fuerte: fuera de las mascaras, pixel-identico al original.
    _assert_outside_identical(
        out, original, [box for _, box in plan["masks"]], ctx
    )

    _write_outputs(out, plan)


def _write_outputs(out, plan):
    """Guarda pagina + thumbnail con los settings del pipeline."""
    name = plan["name"]
    page_tmp = plan["src"] + ".tmp.webp"
    Image.fromarray(out).save(page_tmp, "WEBP", quality=84, method=6)
    with Image.open(page_tmp) as check:
        if check.size != (PAGE_W, PAGE_H):
            raise RuntimeError(f"salida temporal con dimensiones invalidas: {check.size}")
    os.replace(page_tmp, plan["src"])

    # Thumbnail regenerado desde la pagina limpia (480px, q68).
    thumb_src = os.path.join(THUMBS_DIR, name)
    thumb_tmp = thumb_src + ".tmp.webp"
    thumb_img = Image.fromarray(out).resize((THUMB_W, int(PAGE_H * THUMB_W / PAGE_W)), Image.LANCZOS)
    thumb_img.save(thumb_tmp, "WEBP", quality=68, method=6)
    os.replace(thumb_tmp, thumb_src)
    print(f"P{plan['page']:02d} limpia ({plan['src']})")


def _validate_original_backup(path, page_num, kind):
    """Autenticidad y dimensiones estables, independientes de Git/HEAD."""
    expected = ORIGINAL_BACKUP_SHA256.get(page_num, {}).get(kind)
    if expected is None:
        raise RuntimeError(f"restauracion abortada: backup inesperado P{page_num} {kind}")
    if not os.path.isfile(path):
        raise RuntimeError(f"restauracion abortada: falta backup {path}")
    with open(path, "rb") as source:
        data = source.read()
    if sha256(data).hexdigest() != expected:
        raise RuntimeError(f"restauracion abortada: SHA-256 del backup no coincide: {path}")
    expected_size = ((PAGE_W, PAGE_H) if kind == "pages"
                     else (THUMB_W, int(PAGE_H * THUMB_W / PAGE_W)))
    try:
        with Image.open(BytesIO(data)) as image:
            image.load()
            if image.size != expected_size:
                raise RuntimeError(
                    f"restauracion abortada: dimensiones {image.size} en {path}; "
                    f"se esperaban {expected_size}"
                )
    except OSError as error:
        raise RuntimeError(f"restauracion abortada: backup ilegible {path}") from error


def restore_pages(page_nums):
    """Restaura paginas+thumbnails desde backups y resincroniza catalog.json.

    Desacoplado de cualquier deteccion del futuro apply: NO llama a
    detect_bags_plan ni a detectores de filas o glifos. Valida cada
    backup de forma independiente (existencia, legibilidad, dimensiones y
    SHA-256 estable de los originales pre-apply, independiente de HEAD).
    Dos fases: primero valida TODO sin escribir; despues copia,
    re-parchea bytes desde los tamanos reales y verifica. Nunca toca otras
    paginas ni hace git restore.
    """
    jobs = []
    for n in page_nums:
        if not (28 <= n <= 38):
            raise RuntimeError(
                f"P{n:02d}: restore limitado a P28-P38 con backup validado"
            )
        name = f"page-{n:02d}.webp"
        backup_page = os.path.join(BACKUP_DIR, "pages", name)
        backup_thumb = os.path.join(BACKUP_DIR, "thumbnails", name)
        _validate_original_backup(backup_page, n, "pages")
        _validate_original_backup(backup_thumb, n, "thumbnails")
        cur_page = os.path.join(PAGES_DIR, name)
        cur_thumb = os.path.join(THUMBS_DIR, name)
        same = (
            os.path.isfile(cur_page)
            and os.path.isfile(cur_thumb)
            and _files_equal(cur_page, backup_page)
            and _files_equal(cur_thumb, backup_thumb)
        )
        jobs.append((n, name, backup_page, backup_thumb, cur_page, cur_thumb, same))

    for n, name, backup_page, backup_thumb, cur_page, cur_thumb, same in jobs:
        if same:
            print(f"P{n:02d} ya igual al backup (sin cambios)")
            continue
        shutil.copyfile(backup_page, cur_page)
        shutil.copyfile(backup_thumb, cur_thumb)
        print(f"P{n:02d} restaurada desde backup")
    patch_catalog_bytes(page_nums)
    # Verificacion final: binarios iguales al backup y bytes coherentes.
    with open(CATALOG_JSON, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    by_number = {p["number"]: p for p in catalog["pages"]}
    for n, name, backup_page, backup_thumb, cur_page, cur_thumb, _ in jobs:
        for cur, bak in ((cur_page, backup_page), (cur_thumb, backup_thumb)):
            if not _files_equal(cur, bak):
                raise RuntimeError(f"verificacion de restore fallo: {cur}")
        entry = by_number[n]
        for key, path in (("bytes", cur_page), ("thumbnailBytes", cur_thumb)):
            actual = os.path.getsize(path)
            if entry[key] != actual:
                raise RuntimeError(
                    f"catalog.json incoherente en P{n:02d}: {key}={entry[key]} "
                    f"vs archivo {actual}"
                )
    print(f"OK: restore verificado para {len(jobs)} pagina(s)")


def _files_equal(a, b):
    with open(a, "rb") as fa, open(b, "rb") as fb:
        while True:
            ca, cb = fa.read(65536), fb.read(65536)
            if ca != cb:
                return False
            if not ca:
                return True


def patch_catalog_bytes(page_nums):
    """Actualiza bytes/thumbnailBytes por reemplazo quirurgico (1 pagina =
    1 bloque "number": N ... "bytes": X ... "thumbnailBytes": Y)."""
    with open(CATALOG_JSON, "r", encoding="utf-8") as f:
        text = f.read()
    for n in page_nums:
        name = f"page-{n:02d}.webp"
        page_bytes = os.path.getsize(os.path.join(PAGES_DIR, name))
        thumb_bytes = os.path.getsize(os.path.join(THUMBS_DIR, name))
        pattern = re.compile(
            r'("number":\s*' + str(n) + r'\b.*?"bytes":\s*)\d+(.*?"thumbnailBytes":\s*)\d+',
            re.S,
        )
        text, count = pattern.subn(r"\g<1>" + str(page_bytes) + r"\g<2>" + str(thumb_bytes), text, count=1)
        if count != 1:
            raise RuntimeError(f"no se pudo parchear bytes de P{n:02d} en catalog.json")
    with open(CATALOG_JSON, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"catalog.json: bytes actualizados para {len(page_nums)} pagina(s)")


def parse_pages(spec):
    nums = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            nums.update(range(int(a), int(b) + 1))
        elif part:
            nums.add(int(part))
    return sorted(nums)


def main():
    parser = argparse.ArgumentParser(description="Limpieza visual de precios P15-P26 y P28-P38 (ver docstring).")
    parser.add_argument("--preview", action="store_true", help="solo diagnostico en tmp/clean-preview/")
    parser.add_argument("--apply", action="store_true", help="REQUIERE aprobacion manual: aplica limpieza real")
    parser.add_argument("--restore", action="store_true", help="restaura paginas+thumbs desde backups y resincroniza catalog.json (solo P28-P38)")
    parser.add_argument("--pages", default="15-26", help="rango, p. ej. 15, 28-38 o 38 (defecto 15-26)")
    args = parser.parse_args()
    if not args.preview and not args.apply and not args.restore:
        parser.error("modo real bloqueado: usar --preview, o --apply/--restore tras aprobacion manual")
    if sum((args.preview, args.apply, args.restore)) > 1:
        parser.error("--preview, --apply y --restore son excluyentes")
    nums = parse_pages(args.pages)

    if args.restore:
        restore_pages(nums)
        return 0

    if args.preview:
        # Diagnostico visual READ-ONLY: nunca aborta la corrida; marca
        # FAILED y sigue. Solo escribe PNG en PREVIEW_DIR. P28-P38 usa el
        # plan solo-visual (cajas explicitas sin validar) para inspeccionar
        # coordenadas aunque el algoritmo de relleno no este aprobado.
        failed = []
        for n in nums:
            try:
                if 28 <= n <= 38:
                    plan = diagnostic_masks_plan(n)
                else:
                    plan = detect_page(n, strict=False)
                out_path = annotate_preview(plan)
                status = "[OK]" if not plan["warnings"] else "[OK + WARNINGS]"
                detail = plan.get("incluye_method", plan.get("kind", "?"))
                print(f"P{n:02d} preview -> {out_path} {status} {detail}")
                for warning in plan["warnings"]:
                    print(f"  {warning}")
            except RuntimeError as e:
                out_path = annotate_failed(n, str(e))
                failed.append(n)
                print(f"P{n:02d} preview -> {out_path} [FAILED: {e}]")
        if failed:
            print(f"preview con fallos en: {failed} (revisar PNG antes de --apply)")
            return 1
        print("OK: previews diagnosticos listos para revision manual")
        return 0

    # Real: fase 1 valida TODO sin escribir; fase 2 aplica.
    plans = []
    for n in nums:
        plans.append(detect_page(n, strict=True))  # RuntimeError => aborta sin escribir nada
    for plan in plans:
        apply_plan(plan)
    patch_catalog_bytes(nums)
    print("OK")


if __name__ == "__main__":
    sys.exit(main())
