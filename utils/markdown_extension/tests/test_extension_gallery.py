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

    def test_schema_macro_links_types_to_specialized_pages_or_type_sections(self):
        # Use property references to exercise the links emitted in schema docs.
        schema = {
            "definitions": {
                "Example": {
                    "properties": {
                        "axis": {"$ref": "#/definitions/Axis"},
                        "url": {"$ref": "#/definitions/UrlTemplate"},
                        "indexUrl": {"$ref": "#/definitions/IndexUrlTemplate"},
                        "faded": {"$ref": "#/definitions/FadedMultiscaleStops"},
                        "transitioned": {
                            "$ref": "#/definitions/TransitionedMultiscaleStops"
                        },
                        "fallback": {"$ref": "#/definitions/ExampleType"},
                    },
                    "type": "object",
                },
                "Axis": {},
                "UrlTemplate": {},
                "IndexUrlTemplate": {},
                "FadedMultiscaleStops": {},
                "TransitionedMultiscaleStops": {},
                "ExampleType": {},
            }
        }
        type_links = {
            "Axis": "/grammar/axis/#properties",
            "UrlTemplate": "/grammar/data/multi-url/#url-templates",
            "IndexUrlTemplate": "/grammar/data/multi-url/#indexed-files",
            "FadedMultiscaleStops": (
                "/grammar/composition/multiscale/#fadedmultiscalestops"
            ),
            "TransitionedMultiscaleStops": (
                "/grammar/composition/multiscale/#transitionedmultiscalestops"
            ),
            "ExampleType": "/grammar/types/#exampletype",
        }
        preprocessor = MyPreprocessor(None, schema, {}, "", type_links)

        lines = preprocessor.getType("Example")

        self.assertIn(
            ":   Type: [Axis](https://genomespy.app/docs/grammar/axis/#properties)",
            lines,
        )
        self.assertIn(
            ":   Type: [UrlTemplate](https://genomespy.app/docs/grammar/data/multi-url/#url-templates)",
            lines,
        )
        self.assertIn(
            ":   Type: [IndexUrlTemplate](https://genomespy.app/docs/grammar/data/multi-url/#indexed-files)",
            lines,
        )
        self.assertIn(
            ":   Type: [FadedMultiscaleStops](https://genomespy.app/docs/grammar/composition/multiscale/#fadedmultiscalestops)",
            lines,
        )
        self.assertIn(
            ":   Type: [TransitionedMultiscaleStops](https://genomespy.app/docs/grammar/composition/multiscale/#transitionedmultiscalestops)",
            lines,
        )
        self.assertIn(
            ":   Type: [ExampleType](https://genomespy.app/docs/grammar/types/#exampletype)",
            lines,
        )

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
