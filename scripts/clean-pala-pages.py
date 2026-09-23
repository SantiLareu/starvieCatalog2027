#!/usr/bin/env python3
"""
Limpieza visual de paginas de palas (P15-P26) del catalogo StarVie 2027.

Elimina de cada pagina, sobre el asset WebP usado por la app:
  1. Pastilla "MENU" (superior derecha).
  2. Filas "P.V.P" y "STREET PRICE" de la tabla de especificaciones
     (reubica el borde inferior con chanfle bajo la fila BALANCE).
  3. Bloque "TRACKING DE VENTAS" (inferior derecha).

PROTEGIDO (abortar antes que tocar):
  - Filas FORMA/PLANO/PESO/BALANCE con valores, lineas, bordes y chaflanes.
  - Bloque INCLUYE / ECOFRIENDLY GYMSACK y su linea horizontal.
  - Nombre de la pala, fotos, tecnologias, textos utiles, branding.

NO TOCA: PDF original, pipeline, Head.

Requisitos (Windows):  pip install pillow numpy
Uso:
  python scripts/clean-pala-pages.py --preview                 # P15-P26, solo diagnostico
  python scripts/clean-pala-pages.py --preview --pages 15      # solo P15
  python scripts/clean-pala-pages.py --apply                   # REAL (bloqueado sin flag)

Reglas de seguridad:
  - --preview SOLO escribe PNG anotados en tmp/clean-preview/. Nunca
    modifica public/, catalog.json ni backups. No aborta la corrida ante
    una deteccion fallida: marca FAILED/WARNING y sigue (exit 1 al final
    si hubo fallos, pero con todos los previews generados).
  - El modo real exige --apply explicito; primero VALIDA todas las paginas
    (fase deteccion) y solo si todas pasan, aplica. Aborta ante:
    sanity check critico fallido, mascara que invade BALANCE o INCLUYE,
    o filas de precio fuera de la geometria esperada.
  - Exige backup previo en assets/pages-original/{pages,thumbnails}/.
  - Mantiene 1920x1080, WebP q84 en paginas y q68 en thumbnails (480px),
    igual que el pipeline (scripts/build-pdf-pages.mjs + README).
  - Actualiza "bytes"/"thumbnailBytes" de catalog.json por reemplazo
    quirurgico (sin reformatear).

Estrategia: geometria normalizada del template P15-P26 como fuente de
verdad. La imagen solo se usa para sanity checks: siete separadores de
tabla cerca de sus anclas, firmas de texto en las zonas a eliminar y regla
INCLUYE presente. No hay deteccion de bordes verticales ni fallback.

Leyenda del preview: MENU rojo / TRACKING naranja / INCLUYE protegido azul /
filas precio magenta / especificaciones protegidas verde / divisores
amarillos / borde nuevo blanco / margen TRACKING-INCLUYE punteado.
"""

import argparse
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES_DIR = os.path.join(ROOT, "public", "catalog", "pages")
THUMBS_DIR = os.path.join(ROOT, "public", "catalog", "thumbnails")
BACKUP_DIR = os.path.join(ROOT, "assets", "pages-original")
CATALOG_JSON = os.path.join(ROOT, "public", "catalog", "catalog.json")
PREVIEW_DIR = os.path.join(ROOT, "tmp", "clean-preview")

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

    if not (15 <= page_num <= 26):
        raise RuntimeError(f"P{page_num:02d}: fuera del template permitido P15-P26")
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


def annotate_preview(plan):
    """PNG diagnostico con mascaras, protecciones y geometria. Solo preview."""
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
    parser = argparse.ArgumentParser(description="Limpieza visual P15-P26 (ver docstring).")
    parser.add_argument("--preview", action="store_true", help="solo diagnostico en tmp/clean-preview/")
    parser.add_argument("--apply", action="store_true", help="REQUIERE aprobacion manual: aplica limpieza real")
    parser.add_argument("--pages", default="15-26", help="rango, p. ej. 15 (defecto 15-26)")
    args = parser.parse_args()
    if not args.preview and not args.apply:
        parser.error("modo real bloqueado: usar --preview, o --apply tras aprobacion manual")
    if args.preview and args.apply:
        parser.error("--preview y --apply son excluyentes")
    nums = parse_pages(args.pages)

    if args.preview:
        # Diagnostico: nunca aborta la corrida; marca FAILED y sigue.
        # Solo escribe PNG en PREVIEW_DIR.
        failed = []
        for n in nums:
            try:
                plan = detect_page(n, strict=False)
                out_path = annotate_preview(plan)
                status = "[OK]" if not plan["warnings"] else "[OK + WARNINGS]"
                print(f"P{n:02d} preview -> {out_path} {status} INCLUYE: {plan['incluye_method']}")
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
