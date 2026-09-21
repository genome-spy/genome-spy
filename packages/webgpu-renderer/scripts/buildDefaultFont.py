# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.63.0"]
# ///

"""Build the renderer's compact, renamed default TrueType font."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import urllib.request
from pathlib import Path
from typing import Final

from fontTools import subset
from fontTools.ttLib import TTFont


SCRIPT_DIR: Final = Path(__file__).resolve().parent
PACKAGE_DIR: Final = SCRIPT_DIR.parent
DEFAULT_OUTPUT: Final = PACKAGE_DIR / "src" / "fonts" / "DefaultFont.ttf"
LATO_URL: Final = (
    "https://raw.githubusercontent.com/google/fonts/"
    "f3b885d5590e307e02542f1a724cec55d567fdaa/ofl/lato/"
    "Lato-Regular.ttf"
)
LATO_SHA256: Final = "d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251"

ASCII: Final = set(range(0x0020, 0x007F))
WESTERN_EUROPEAN: Final = {
    ord(character)
    for character in (
        "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ"
        "ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ"
        "ŒœŠšŽž"
    )
}
GREEK_ALPHABET: Final = (
    set(range(0x0391, 0x03A2))
    | set(range(0x03A3, 0x03AA))
    | set(range(0x03B1, 0x03CA))
    | {0x03D1, 0x03D5, 0x03D6, 0x03F5}
)
PLOT_SYMBOLS: Final = {
    0x00A0,  # non-breaking space
    0x00A2,  # cent
    0x00A3,  # pound
    0x00A5,  # yen
    0x00B0,  # degree
    0x00B1,  # plus-or-minus
    0x00B2,  # superscript two
    0x00B3,  # superscript three
    0x00B5,  # micro sign
    0x00B7,  # middle dot
    0x00B9,  # superscript one
    0x00D7,  # multiplication
    0x00F7,  # division
    0x2013,  # en dash
    0x2014,  # em dash
    0x2020,  # dagger
    0x2021,  # double dagger
    0x2022,  # bullet
    0x2026,  # ellipsis
    0x2030,  # per mille
    0x2032,  # prime
    0x2033,  # double prime
    0x2044,  # fraction slash
    0x2070,  # superscript zero
    0x2071,  # superscript i
    *range(0x2074, 0x207F),  # remaining superscripts and operators
    *range(0x2080, 0x208F),  # subscripts and operators
    0x20AC,  # euro
    0x2113,  # script small l
    0x2126,  # ohm sign
    *range(0x2190, 0x219A),  # common arrows
    0x2202,  # partial differential
    0x220F,  # n-ary product
    0x2211,  # n-ary summation
    0x2212,  # mathematical minus
    0x2215,  # division slash
    0x221A,  # square root
    0x221E,  # infinity
    0x222B,  # integral
    0x2248,  # almost equal
    0x2260,  # not equal
    0x2261,  # identical to
    0x2264,  # less-than or equal
    0x2265,  # greater-than or equal
}

REPERTOIRE_GROUPS: Final = {
    "ascii": ASCII,
    "western-european": WESTERN_EUROPEAN,
    "greek": GREEK_ALPHABET,
    "plot-symbols": PLOT_SYMBOLS,
}

REQUIRED_TABLES: Final = {
    "OS/2",
    "GPOS",
    "cmap",
    "glyf",
    "head",
    "hhea",
    "hmtx",
    "loca",
    "maxp",
    "name",
    "post",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        help="Pinned Lato-Regular.ttf; downloads it from Google Fonts by default.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--repertoire",
        choices=("default", "core"),
        default="default",
        help="Use 'core' to omit Latin-1 and Latin Extended-A for size comparison.",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_lato(destination: Path) -> None:
    request = urllib.request.Request(
        LATO_URL, headers={"User-Agent": "GenomeSpy default-font builder"}
    )
    with urllib.request.urlopen(request) as response, destination.open("wb") as output:
        while block := response.read(1024 * 1024):
            output.write(block)


def verify_source(path: Path) -> None:
    actual = sha256(path)
    if actual != LATO_SHA256:
        raise RuntimeError(
            f"Unexpected Lato source checksum: {actual}. Expected {LATO_SHA256}."
        )


def get_repertoire(profile: str) -> set[int]:
    groups = ("ascii", "greek", "plot-symbols")
    if profile == "default":
        groups += ("western-european",)
    return set().union(*(REPERTOIRE_GROUPS[group] for group in groups))


def get_unicode_cmap(font: TTFont) -> dict[int, str]:
    cmap: dict[int, str] = {}
    for table in font["cmap"].tables:
        if table.isUnicode():
            cmap.update(table.cmap)
    return cmap


def configure_names(font: TTFont) -> None:
    name = font["name"]
    name.names.clear()
    records = {
        0: (
            "Copyright 2010-2014 tyPoland Lukasz Dziedzic. "
            "Modified and renamed under the SIL OFL 1.1."
        ),
        1: "Default Font",
        2: "Regular",
        3: "Default Font Regular 1.0",
        4: "Default Font Regular",
        5: "Version 1.000",
        6: "DefaultFont-Regular",
        13: "Licensed under the SIL Open Font License, Version 1.1.",
        14: "https://openfontlicense.org",
        16: "Default Font",
        17: "Regular",
    }
    for name_id, value in records.items():
        name.setName(value, name_id, 3, 1, 0x0409)


def subset_font(source: Path, output: Path, repertoire: set[int]) -> None:
    options = subset.Options()
    options.hinting = False
    options.layout_features = ["kern"]
    options.layout_scripts = ["*"]
    options.legacy_kern = False
    options.glyph_names = False
    options.name_legacy = False
    options.notdef_glyph = True
    options.notdef_outline = False
    options.recommended_glyphs = False
    options.retain_gids = False
    options.recalc_bounds = True
    options.recalc_timestamp = False
    options.canonical_order = True
    options.recalc_average_width = True
    options.recalc_max_context = True

    font = TTFont(source, recalcTimestamp=False)
    source_cmap = get_unicode_cmap(font)
    missing = sorted(repertoire - source_cmap.keys())
    if missing:
        formatted = ", ".join(f"U+{codepoint:04X}" for codepoint in missing)
        raise RuntimeError(f"Pinned Lato source lacks requested characters: {formatted}")

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(repertoire))
    subsetter.subset(font)

    for tag in list(font.keys()):
        if tag != "GlyphOrder" and tag not in REQUIRED_TABLES:
            del font[tag]
    missing_tables = REQUIRED_TABLES - set(font.keys())
    if missing_tables:
        raise RuntimeError(f"Subset is missing required tables: {sorted(missing_tables)}")

    configure_names(font)
    font["post"].formatType = 3.0
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=output.parent, prefix=output.name, suffix=".tmp", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        font.save(temporary_path, reorderTables=True)
        temporary_path.replace(output)
    finally:
        temporary_path.unlink(missing_ok=True)


def validate_output(output: Path, repertoire: set[int]) -> dict[str, object]:
    font = TTFont(output, recalcTimestamp=False)
    tables = set(font.keys()) - {"GlyphOrder"}
    cmap = get_unicode_cmap(font)
    missing = repertoire - cmap.keys()
    if missing:
        raise RuntimeError("Generated font does not cover the requested repertoire.")
    if tables != REQUIRED_TABLES:
        raise RuntimeError(f"Generated font has unexpected tables: {sorted(tables)}")
    family = font["name"].getName(1, 3, 1, 0x0409)
    if family is None or family.toUnicode() != "Default Font":
        raise RuntimeError("Generated font was not renamed to Default Font.")
    return {
        "output": str(output),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "glyphs": font["maxp"].numGlyphs,
        "codepoints": len(repertoire),
        "tables": sorted(tables),
    }


def main() -> None:
    args = parse_args()
    repertoire = get_repertoire(args.repertoire)
    if args.source:
        source = args.source.resolve()
        verify_source(source)
        subset_font(source, args.output.resolve(), repertoire)
    else:
        with tempfile.TemporaryDirectory(prefix="genome-spy-default-font-") as temp:
            source = Path(temp) / "Lato-Regular.ttf"
            download_lato(source)
            verify_source(source)
            subset_font(source, args.output.resolve(), repertoire)

    report = validate_output(args.output.resolve(), repertoire)
    report["repertoire"] = args.repertoire
    report["groups"] = {
        name: len(codepoints) for name, codepoints in REPERTOIRE_GROUPS.items()
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
