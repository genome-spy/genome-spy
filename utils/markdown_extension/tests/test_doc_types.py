import importlib.util
import json
from pathlib import Path
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

    def test_type_index_contains_only_undocumented_core_types(self):
        rendered_types, _ = generate_doc_types.generate()

        self.assertIn("## AggregateOp", rendered_types)
        self.assertNotIn("## MultiscaleSpec", rendered_types)
        self.assertNotIn("## FadedMultiscaleStops", rendered_types)
        self.assertNotIn("## IndexUrlTemplate", rendered_types)


if __name__ == "__main__":
    unittest.main()
