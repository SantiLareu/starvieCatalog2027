"""Verified original preflight + restore in temporary fixtures. Never applies."""

from contextlib import redirect_stdout
from hashlib import sha256
from io import BytesIO, StringIO
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = runpy.run_path(str(ROOT / "scripts" / "clean-pala-pages.py"))
REQUIRE_EDGES = SCRIPT["_require_clean_edges"]
ORIGINAL_FIXTURES = ROOT / "assets" / "pages-original"

# Verified against original Git blobs at 03ee0f7bd8ea41388db3d1b41f18e054cd87f3e3.
# Pin digests, rather than HEAD: future commits may contain cleaned public assets.
ORIGINAL_FIXTURE_SHA256 = {
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


def original_fixture(page, kind):
    fixture = ORIGINAL_FIXTURES / kind / f"page-{page}.webp"
    data = fixture.read_bytes()
    if sha256(data).hexdigest() != ORIGINAL_FIXTURE_SHA256[page][kind]:
        raise AssertionError(f"Original fixture does not match verified SHA-256: {fixture}")
    expected_size = (1920, 1080) if kind == "pages" else (480, 270)
    with Image.open(BytesIO(data)) as image:
        if image.size != expected_size:
            raise AssertionError(f"Unexpected original fixture dimensions: {fixture}")
    return data


class LocalEdgeValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.masks = []
        for page in range(28, 39):
            page_data = original_fixture(page, "pages")
            original_fixture(page, "thumbnails")
            with Image.open(BytesIO(page_data)) as image:
                gray = np.asarray(image.convert("RGB")).mean(axis=2)
            entries = (SCRIPT["GLYPH_MASKS"][page].items() if page < 38
                       else SCRIPT["P38_MASKS"])
            cls.masks.extend((page, name, SCRIPT["frac_to_px"](box), gray)
                             for name, box in entries)

    def test_all_28_approved_masks_pass(self):
        self.assertEqual(len(self.masks), 28)
        self.assertEqual(len(SCRIPT["P38_MASKS"]), 8)
        self.assertEqual(SCRIPT["GLYPH_EDGE_TOL"], 25.0)
        for page, name, box, gray in self.masks:
            with self.subTest(page=page, mask=name):
                REQUIRE_EDGES(gray, box, f"P{page} [{name}]")

    def test_key_ring_expected_ranges_pass(self):
        page, name, box, gray = next(item for item in self.masks if item[1] == "key ring")
        self.assertEqual(box, (1463, 986, 1617, 1013))
        x0, y0, x1, y1 = box
        left = gray[y0:y1, x0:x0 + 2]
        right = gray[y0:y1, x1 - 2:x1]
        self.assertEqual(float(np.ptp(left)), 4.0)
        self.assertEqual(float(np.ptp(right)), 16.0)
        self.assertEqual(float(max(left.max(), right.max()) - min(left.min(), right.min())), 28.0)
        self.assertAlmostEqual(float(np.ptp(gray[y0:y1, x0 - 2:x0 + 2])), 4.333333, places=5)
        self.assertEqual(float(np.ptp(gray[y0:y1, x1 - 2:x1 + 2])), 16.0)
        REQUIRE_EDGES(gray, box, f"P{page} [{name}]")

    def assert_contamination_rejected(self, kind):
        for page, name, box, original in self.masks:
            x0, y0, x1, y1 = box
            gray = original.copy()
            value = 255 if page < 38 else 0
            if kind == "left":
                gray[y0:y1, x0:x0 + 2] = value
            elif kind == "right":
                gray[y0:y1, x1 - 2:x1] = value
            elif kind == "horizontal":
                gray[(y0 + y1) // 2:(y0 + y1) // 2 + 2, x0:x1] = value
            else:
                gray[(y0 + y1) // 2, x1 - 1] = value
            with self.subTest(page=page, mask=name, contamination=kind):
                with self.assertRaisesRegex(RuntimeError, "contaminado"):
                    REQUIRE_EDGES(gray, box, f"P{page} [{name}]")

    def test_uniform_left_contamination_fails_on_all_masks(self):
        self.assert_contamination_rejected("left")

    def test_uniform_right_contamination_fails_on_all_masks(self):
        self.assert_contamination_rejected("right")

    def test_horizontal_line_fails_on_all_masks(self):
        self.assert_contamination_rejected("horizontal")

    def test_high_contrast_pixel_fails_on_all_masks(self):
        self.assert_contamination_rejected("pixel")

    def test_missing_exterior_columns_fail_closed(self):
        gray = np.full((20, 40), 100.0)
        for box in ((0, 2, 30, 12), (1, 2, 30, 12), (5, 2, 40, 12), (5, 2, 39, 12)):
            with self.subTest(box=box):
                with self.assertRaisesRegex(RuntimeError, "incompletas"):
                    REQUIRE_EDGES(gray, box, "missing exterior")

    def test_empty_invalid_or_too_narrow_samples_fail_closed(self):
        gray = np.full((20, 40), 100.0)
        for box in ((5, 2, 30, 2), (5, -1, 30, 12), (5, 2, 30, 21), (5, 2, 8, 12)):
            with self.subTest(box=box):
                with self.assertRaisesRegex(RuntimeError, "incompletas"):
                    REQUIRE_EDGES(gray, box, "invalid sample")

    def test_different_uniform_levels_on_gradient_are_allowed(self):
        gray = np.tile(np.linspace(80, 200, 40), (20, 1))
        box = (4, 2, 35, 12)
        self.assertGreater(float(gray[2:12, 4:35].max() - gray[2:12, 4:35].min()), 25)
        REQUIRE_EDGES(gray, box, "gradient")

    def test_threshold_25_passes_and_26_fails(self):
        gray = np.full((20, 40), 100.0)
        box = (5, 2, 30, 12)
        # An exterior pixel must participate in the local validation.
        gray[7, 3] = 125
        REQUIRE_EDGES(gray, box, "threshold boundary")
        gray[7, 3] = 126
        with self.assertRaisesRegex(RuntimeError, "izquierdo.*contaminado"):
            REQUIRE_EDGES(gray, box, "threshold boundary")

    def test_all_11_pages_pass_internal_preflight_without_apply(self):
        # Override only the test module's input path, then restore it.
        # Public assets may legitimately be either original or already cleaned.
        with patch.dict(SCRIPT["detect_page"].__globals__,
                        {"PAGES_DIR": str(ORIGINAL_FIXTURES / "pages")}):
            for page in range(28, 39):
                with self.subTest(page=page):
                    plan = SCRIPT["detect_page"](page, strict=True)
                    self.assertEqual(plan["page"], page)
                    self.assertEqual(plan["kind"], "p38" if page == 38 else "bags")


class RestoreTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix="starvie-restore-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.backups = self.root / "originals"
        self.targets = self.root / "public" / "catalog"
        for kind in ("pages", "thumbnails"):
            (self.backups / kind).mkdir(parents=True)
            (self.targets / kind).mkdir(parents=True)
            for page in range(28, 39):
                name = f"page-{page}.webp"
                (self.backups / kind / name).write_bytes(original_fixture(page, kind))
                # These cleaned targets represent what HEAD will contain after commit.
                (self.targets / kind / name).write_bytes(
                    (ROOT / "public" / "catalog" / kind / name).read_bytes())
        self.catalog = self.targets / "catalog.json"
        self.catalog.write_bytes((ROOT / "public" / "catalog" / "catalog.json").read_bytes())
        self.restore = SCRIPT["restore_pages"]
        override = patch.dict(self.restore.__globals__, {
            "PAGES_DIR": str(self.targets / "pages"),
            "THUMBS_DIR": str(self.targets / "thumbnails"),
            "BACKUP_DIR": str(self.backups),
            "CATALOG_JSON": str(self.catalog),
        })
        override.start()
        self.addCleanup(override.stop)

    def snapshot(self):
        return {path.relative_to(self.targets): path.read_bytes()
                for path in self.targets.rglob("*") if path.is_file()}

    def assert_restore_rejected_without_writes(self, pages, message):
        before = self.snapshot()
        with self.assertRaisesRegex(RuntimeError, message):
            self.restore(pages)
        self.assertEqual(self.snapshot(), before)

    def test_restore_hashes_match_independently_verified_originals(self):
        self.assertEqual(SCRIPT["ORIGINAL_BACKUP_SHA256"], ORIGINAL_FIXTURE_SHA256)

    def test_restore_authentic_originals_over_cleaned_targets_without_git(self):
        # Even an unavailable Git/HEAD cannot affect restore authenticity.
        with patch("subprocess.run", side_effect=AssertionError("restore must not query Git")), \
                redirect_stdout(StringIO()):
            self.restore(list(range(28, 39)))
        catalog = json.loads(self.catalog.read_text(encoding="utf-8"))
        for page in range(28, 39):
            entry = next(item for item in catalog["pages"] if item["number"] == page)
            for kind, key in (("pages", "bytes"), ("thumbnails", "thumbnailBytes")):
                result = (self.targets / kind / f"page-{page}.webp").read_bytes()
                self.assertEqual(result, original_fixture(page, kind))
                self.assertEqual(entry[key], len(result))
        with redirect_stdout(StringIO()):
            self.restore(list(range(28, 39)))  # Already restored is also safe.

    def test_missing_backup_aborts_before_any_page_is_written(self):
        for kind in ("pages", "thumbnails"):
            with self.subTest(kind=kind):
                path = self.backups / kind / "page-38.webp"
                data = path.read_bytes()
                path.unlink()
                self.assert_restore_rejected_without_writes([28, 38], "falta backup")
                path.write_bytes(data)

    def test_altered_backup_aborts_before_any_page_is_written(self):
        for kind in ("pages", "thumbnails"):
            with self.subTest(kind=kind):
                path = self.backups / kind / "page-38.webp"
                data = path.read_bytes()
                path.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
                self.assert_restore_rejected_without_writes([28, 38], "SHA-256")
                path.write_bytes(data)

    def test_corrupt_backup_aborts_before_any_page_is_written(self):
        for kind in ("pages", "thumbnails"):
            with self.subTest(kind=kind):
                path = self.backups / kind / "page-38.webp"
                data = path.read_bytes()
                path.write_bytes(b"not a WebP")
                self.assert_restore_rejected_without_writes([28, 38], "SHA-256")
                path.write_bytes(data)

    def test_backup_replaced_by_another_valid_image_is_rejected(self):
        for kind in ("pages", "thumbnails"):
            with self.subTest(kind=kind):
                path = self.backups / kind / "page-38.webp"
                data = path.read_bytes()
                path.write_bytes(original_fixture(37, kind))
                self.assert_restore_rejected_without_writes([28, 38], "SHA-256")
                path.write_bytes(data)

    def test_unexpected_page_or_kind_fails_closed(self):
        self.assert_restore_rejected_without_writes([28, 27], "restore limitado")
        with self.assertRaisesRegex(RuntimeError, "backup inesperado"):
            SCRIPT["_validate_original_backup"](str(self.backups / "pages" / "page-28.webp"),
                                                28, "unexpected")

    def test_dimensions_are_required_even_with_a_matching_hash(self):
        for kind in ("pages", "thumbnails"):
            with self.subTest(kind=kind):
                path = self.backups / kind / "page-28.webp"
                original = path.read_bytes()
                Image.new("RGB", (16, 16)).save(path, "WEBP")
                # Isolate the dimension guard from the independent hash guard.
                hashes = {**ORIGINAL_FIXTURE_SHA256[28],
                          kind: sha256(path.read_bytes()).hexdigest()}
                with patch.dict(SCRIPT["ORIGINAL_BACKUP_SHA256"], {28: hashes}):
                    self.assert_restore_rejected_without_writes([28], "dimensiones")
                path.write_bytes(original)

    def test_illegible_image_fails_closed_even_with_a_matching_hash(self):
        path = self.backups / "pages" / "page-28.webp"
        path.write_bytes(b"not a WebP")
        hashes = {**ORIGINAL_FIXTURE_SHA256[28], "pages": sha256(path.read_bytes()).hexdigest()}
        with patch.dict(SCRIPT["ORIGINAL_BACKUP_SHA256"], {28: hashes}):
            self.assert_restore_rejected_without_writes([28], "backup ilegible")


if __name__ == "__main__":
    unittest.main()
