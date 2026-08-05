"""Generate the grammar type index and schema documentation links."""

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

from markdown.extensions.toc import slugify


REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = REPO_ROOT / "docs"
SCHEMA_PATH = DOCS_DIR / "schema.json"
APP_SCHEMA_PATH = DOCS_DIR / "app-schema.json"
TYPES_PATH = DOCS_DIR / "grammar" / "types.md"
TYPE_LINKS_PATH = DOCS_DIR / "type-links.json"

SCHEMA_PATTERN = re.compile(r"^(SCHEMA|APP_SCHEMA)\s+(\w+)(?:\s+.*)?$")
HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
TYPE_NAME_PATTERN = re.compile(r"^\w+$")


# These types have dedicated prose documentation but no SCHEMA declaration.
# Keep their source locations here so the generator validates their links and
# the Markdown extension does not need a separate hardcoded link map.
MANUAL_DOCUMENTATION: dict[str, tuple[str, str | None]] = {
    "Encoding": ("grammar/mark/index.md", "Encoding"),
    "ExprRef": ("grammar/expressions.md", None),
    "VariableParameter": ("grammar/parameters.md", None),
    "SelectionParameter": ("grammar/parameters.md", "Selection Parameters"),
    "MarkConfig": ("grammar/mark/index.md", "Properties"),
    "PointConfig": ("grammar/mark/point.md", "Properties"),
    "RectConfig": ("grammar/mark/rect.md", "Properties"),
    "RuleConfig": ("grammar/mark/rule.md", "Properties"),
    "TickConfig": ("grammar/mark/tick.md", "Properties"),
    "TextConfig": ("grammar/mark/text.md", "Properties"),
    "LinkConfig": ("grammar/mark/link.md", "Properties"),
    "ScaleConfig": ("grammar/config.md", "Scale defaults"),
    "RangeConfig": ("grammar/config.md", "Scale defaults"),
    "StyleConfig": ("grammar/config.md", "Theme, Config, and Style"),
    "UrlData": ("grammar/data/eager.md", "URL Data"),
    "InlineData": ("grammar/data/eager.md", "Inline Data"),
    "NamedData": ("grammar/data/eager.md", "Named Data"),
    "Generator": ("grammar/data/eager.md", "Sequence Generator"),
    "LazyData": ("grammar/data/lazy.md", None),
    "IndexUrlTemplate": ("grammar/data/multi-url.md", "Indexed Files"),
}


@dataclass(frozen=True)
class Heading:
    """A Markdown heading and the anchor generated for it."""

    line_number: int
    text: str
    anchor: str


@dataclass(frozen=True)
class Documentation:
    """The source location of a documented schema type."""

    path: Path
    heading: Heading | None

    def url(self, docs_dir: Path) -> str:
        relative_path = self.path.relative_to(docs_dir).with_suffix("")
        if relative_path.name == "index":
            relative_path = relative_path.parent

        page_path = "/".join(relative_path.parts)
        page_url = "/" if not page_path else f"/{page_path}/"
        return page_url + (f"#{self.heading.anchor}" if self.heading else "")


def get_heading_text(match: re.Match[str]) -> str:
    """Return heading text without Markdown closing hashes or attributes."""
    text = match.group(2)
    text = re.sub(r"\s+\{[^}]*\}\s*$", "", text)
    return text.rstrip(" #")


def get_heading_anchor(match: re.Match[str], text: str) -> str:
    """Return a custom heading ID or the generated Markdown anchor."""
    custom_anchor = re.search(r"\{\s*#([\w-]+)\s*\}", match.group(2))
    return custom_anchor.group(1) if custom_anchor else slugify(text, "-")


def get_headings(path: Path) -> list[Heading]:
    """Parse headings and reproduce Zensical's duplicate-anchor suffixes."""
    headings = []
    anchor_counts: dict[str, int] = {}

    for line_number, line in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
        match = HEADING_PATTERN.match(line)
        if not match:
            continue

        text = get_heading_text(match)
        anchor = get_heading_anchor(match, text)
        if not anchor:
            raise ValueError(f"Heading on {path}:{line_number} has no URL anchor")

        duplicate_count = anchor_counts.get(anchor, 0)
        anchor_counts[anchor] = duplicate_count + 1
        if duplicate_count:
            anchor = f"{anchor}_{duplicate_count}"

        headings.append(Heading(line_number, text, anchor))

    return headings


def get_documentation_for_heading(
    path: Path, heading_text: str | None
) -> Documentation:
    """Resolve a manual documentation declaration to a validated location."""
    if heading_text is None:
        return Documentation(path, None)

    matches = [heading for heading in get_headings(path) if heading.text == heading_text]
    if len(matches) != 1:
        raise ValueError(
            f"Expected one heading {heading_text!r} in {path}, found {len(matches)}"
        )

    return Documentation(path, matches[0])


def get_explicit_documentation(docs_dir: Path) -> dict[str, Documentation]:
    """Find schema macros and link them to their nearest preceding heading."""
    documentation: dict[str, Documentation] = {}

    for path in sorted(docs_dir.rglob("*.md")):
        if path == docs_dir / "grammar" / "types.md":
            continue

        headings = get_headings(path)
        for line_number, line in enumerate(
            path.read_text(encoding="utf8").splitlines(), 1
        ):
            match = SCHEMA_PATTERN.match(line)
            if not match:
                continue

            preceding_headings = [
                heading for heading in headings if heading.line_number < line_number
            ]
            heading = preceding_headings[-1] if preceding_headings else None
            type_name = match.group(2)
            current = Documentation(path, heading)
            previous = documentation.get(type_name)

            if previous is None:
                documentation[type_name] = current
            elif previous.path != current.path:
                raise ValueError(
                    f"Type {type_name!r} is documented in both "
                    f"{previous.path} and {current.path}"
                )
            elif previous.heading and current.heading:
                # A type can be expanded in multiple sections. A page-level
                # link is unambiguous when there is no single section target.
                if previous.heading.anchor != current.heading.anchor:
                    documentation[type_name] = Documentation(path, None)

    return documentation


def get_documentation(docs_dir: Path) -> dict[str, Documentation]:
    """Combine SCHEMA declarations with validated prose-only documentation."""
    documentation = get_explicit_documentation(docs_dir)

    for type_name, (relative_path, heading_text) in MANUAL_DOCUMENTATION.items():
        if type_name in documentation:
            continue

        path = docs_dir / relative_path
        if not path.is_file():
            raise ValueError(f"Documentation file does not exist: {path}")
        documentation[type_name] = get_documentation_for_heading(path, heading_text)

    return documentation


def get_indexed_types(
    schema: dict, documented_types: set[str]
) -> list[str]:
    """Return simple schema types that have no dedicated documentation."""
    return sorted(
        type_name
        for type_name in schema["definitions"]
        if TYPE_NAME_PATTERN.fullmatch(type_name) and type_name not in documented_types
    )


def render_types_page(type_names: list[str]) -> str:
    """Render the generated Markdown source for the grammar type index."""
    lines = [
        "# Types Used in the Grammar",
        "",
        "<!-- Generated by `npm run generate:doc-types`. -->",
        "",
        "These types are used in the grammar but are not documented elsewhere.",
        "",
    ]

    for type_name in type_names:
        lines.extend([f"## {type_name}", "", f"SCHEMA {type_name}", ""])

    return "\n".join(lines)


def render_type_links(
    documentation: dict[str, Documentation],
    indexed_types: list[str],
    docs_dir: Path,
) -> str:
    """Render the generated type-to-documentation URL map."""
    links = {
        type_name: documented_type.url(docs_dir)
        for type_name, documented_type in sorted(documentation.items())
    }
    links.update(
        {
            type_name: f"/grammar/types/#{slugify(type_name, '-')}"
            for type_name in indexed_types
        }
    )
    return json.dumps(links, indent=2) + "\n"


def generate(
    docs_dir: Path = DOCS_DIR,
    schema_path: Path = SCHEMA_PATH,
    app_schema_path: Path = APP_SCHEMA_PATH,
) -> tuple[str, str]:
    """Generate the type index and type-link map contents."""
    schema = json.loads(schema_path.read_text(encoding="utf8"))
    app_schema = json.loads(app_schema_path.read_text(encoding="utf8"))
    documentation = get_documentation(docs_dir)
    schema_type_names = set(schema["definitions"]) | set(app_schema["definitions"])
    undocumented_macros = set(documentation) - schema_type_names
    if undocumented_macros:
        raise ValueError(
            "Documentation references unknown schema types: "
            + ", ".join(sorted(undocumented_macros))
        )

    indexed_types = get_indexed_types(schema, set(documentation))
    return (
        render_types_page(indexed_types),
        render_type_links(documentation, indexed_types, docs_dir),
    )


def main() -> int:
    """Generate documentation artifacts or check that they are current."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if generated documentation artifacts are out of date",
    )
    args = parser.parse_args()

    rendered_types, rendered_links = generate()
    current_types = TYPES_PATH.read_text(encoding="utf8") if TYPES_PATH.exists() else None
    current_links = (
        TYPE_LINKS_PATH.read_text(encoding="utf8") if TYPE_LINKS_PATH.exists() else None
    )

    stale = []
    if current_types != rendered_types:
        stale.append(str(TYPES_PATH.relative_to(REPO_ROOT)))
    if current_links != rendered_links:
        stale.append(str(TYPE_LINKS_PATH.relative_to(REPO_ROOT)))

    if stale and args.check:
        print("Generated documentation is out of date: " + ", ".join(stale))
        print("Run npm run generate:doc-types.")
        return 1

    if current_types != rendered_types:
        TYPES_PATH.write_text(rendered_types, encoding="utf8")
    if current_links != rendered_links:
        TYPE_LINKS_PATH.write_text(rendered_links, encoding="utf8")

    if stale:
        print("Generated " + ", ".join(stale) + ".")
    else:
        print("Generated documentation is up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
