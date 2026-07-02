import json
import tempfile
import unittest
from pathlib import Path

from extension.extension import MyPreprocessor


class ExampleGalleryPreprocessorTest(unittest.TestCase):
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
