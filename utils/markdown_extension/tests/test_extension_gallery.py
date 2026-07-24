import json
import tempfile
import unittest
from pathlib import Path

from markdown import markdown

from extension.extension import MyPreprocessor


class ExampleGalleryPreprocessorTest(unittest.TestCase):
    def test_schema_macro_dereferences_type_aliases(self):
        schema = {
            "definitions": {
                "Transition": {"$ref": "#/definitions/LerpTransition"},
                "LerpTransition": {
                    "properties": {
                        "halfLife": {
                            "description": "Time until the remaining distance halves.",
                            "type": "number",
                        }
                    },
                    "type": "object",
                },
            }
        }
        preprocessor = MyPreprocessor(None, schema, {}, "")

        lines = preprocessor.getType("Transition")

        self.assertIn("`halfLife`", lines)

    def test_schema_macro_keeps_property_descriptions_in_definition_list(self):
        schema = {
            "definitions": {
                "Example": {
                    "properties": {
                        "first": {
                            "description": "First property.\n\nAdditional details.",
                            "type": "string",
                        },
                        "second": {
                            "description": "Second property.",
                            "type": "number",
                        },
                    },
                    "type": "object",
                }
            }
        }
        preprocessor = MyPreprocessor(None, schema, {}, "")

        html = markdown(
            "\n".join(preprocessor.getType("Example")),
            extensions=["def_list"],
        )

        first_definition_start = html.index("<dd>")
        first_definition_end = html.index("</dd>", first_definition_start)
        description_start = html.index("<p>First property.</p>")

        self.assertEqual(html.count("<dl>"), 1)
        self.assertEqual(html.count("<dd>"), 2)
        self.assertLess(first_definition_start, description_start)
        self.assertLess(description_start, first_definition_end)

    def test_gallery_accepts_blank_line_after_macro(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            example_dir = repo_root / "examples" / "docs" / "demo"
            example_dir.mkdir(parents=True)
            (example_dir / "track.json").write_text(
                json.dumps({"description": "Demo track description."}),
                encoding="utf8",
            )
            (example_dir / "track.png").write_bytes(b"png")

            preprocessor = MyPreprocessor(None, {}, {}, str(repo_root))
            lines = preprocessor.run(
                [
                    "EXAMPLE_GALLERY examples/docs/demo",
                    "",
                    "- [Demo Track](demo.md) track.json",
                    "",
                    "## Next Section",
                ]
            )

        html = "\n".join(lines)
        self.assertIn('class="example-gallery"', html)
        self.assertIn('href="demo/"', html)
        self.assertIn("## Next Section", html)


if __name__ == "__main__":
    unittest.main()
