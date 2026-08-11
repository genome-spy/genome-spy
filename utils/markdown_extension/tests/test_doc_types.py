import importlib.util
import json
from pathlib import Path
import re
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "generate-doc-types.py"
SCRIPT_SPEC = importlib.util.spec_from_file_location("generate_doc_types", SCRIPT_PATH)
generate_doc_types = importlib.util.module_from_spec(SCRIPT_SPEC)
assert SCRIPT_SPEC.loader is not None
SCRIPT_SPEC.loader.exec_module(generate_doc_types)


class DocumentationTypesTest(unittest.TestCase):
    def test_explicit_schema_docs_link_to_their_sections(self):
        _, rendered_links = generate_doc_types.generate()
        links = json.loads(rendered_links)

        self.assertEqual(
            links["FadedMultiscaleStops"],
            "/grammar/composition/multiscale/#fadedmultiscalestops",
        )
        self.assertEqual(
            links["TransitionedMultiscaleStops"],
            "/grammar/composition/multiscale/#transitionedmultiscalestops",
        )
        self.assertEqual(links["Axis"], "/grammar/axis/#properties")
        self.assertEqual(
            links["BigWigData"], "/grammar/data/lazy/#parameters_1"
        )

    def test_type_index_contains_all_core_types_and_links_documented_types(self):
        rendered_types, _ = generate_doc_types.generate()

        schema = json.loads(generate_doc_types.SCHEMA_PATH.read_text(encoding="utf8"))
        expected_types = {
            type_name
            for type_name in schema["definitions"]
            if generate_doc_types.TYPE_NAME_PATTERN.fullmatch(type_name)
        }
        rendered_headings = set(
            re.findall(r"^## (\w+)$", rendered_types, re.MULTILINE)
        )
        self.assertEqual(rendered_headings, expected_types)

        self.assertIn("## AggregateOp", rendered_types)
        self.assertIn("SCHEMA AggregateOp", rendered_types)
        self.assertIn("## MultiscaleSpec", rendered_types)
        self.assertIn(
            "[MultiscaleSpec documentation](composition/multiscale.md#properties)",
            rendered_types,
        )
        self.assertIn("## IndexUrlTemplate", rendered_types)
        self.assertIn(
            "[IndexUrlTemplate documentation](data/multi-url.md#indexed-files)",
            rendered_types,
        )
        self.assertNotIn("SCHEMA MultiscaleSpec", rendered_types)


if __name__ == "__main__":
    unittest.main()
