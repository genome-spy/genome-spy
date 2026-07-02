import json
import tempfile
import unittest
from pathlib import Path

from extension.example_gallery import render_example_gallery


class ExampleGalleryTest(unittest.TestCase):
    def test_renders_gallery_from_markdown_list_items(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            example_dir = repo_root / "examples" / "docs" / "demo"
            example_dir.mkdir(parents=True)
            (example_dir / "track.json").write_text(
                json.dumps({"description": ["Demo track description."]}),
                encoding="utf8",
            )
            (example_dir / "track.png").write_bytes(b"png")

            lines = render_example_gallery(
                str(repo_root),
                "examples/docs/demo",
                ["- [Demo Track](demo.md) track.json"],
            )

        html = "\n".join(lines)
        self.assertIn('class="example-gallery"', html)
        self.assertIn('href="demo/"', html)
        self.assertIn(
            'src="../../examples/docs/demo/track.png"',
            html,
        )
        self.assertIn("Demo Track", html)
        self.assertIn("Demo track description.", html)

    def test_missing_thumbnail_returns_build_error_line(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            example_dir = repo_root / "examples" / "docs" / "demo"
            example_dir.mkdir(parents=True)
            (example_dir / "track.json").write_text(
                json.dumps({"description": "Demo track description."}),
                encoding="utf8",
            )

            lines = render_example_gallery(
                str(repo_root),
                "examples/docs/demo",
                ["- [Demo Track](demo.md) track.json"],
            )

        self.assertEqual(
            lines,
            [
                "Missing EXAMPLE_GALLERY thumbnail: "
                "examples/docs/demo/track.png"
            ],
        )

    def test_uses_second_description_array_item_when_available(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            example_dir = repo_root / "examples" / "docs" / "demo"
            example_dir.mkdir(parents=True)
            (example_dir / "track.json").write_text(
                json.dumps(
                    {
                        "description": [
                            "Short gallery title.",
                            "Longer gallery description.",
                        ]
                    }
                ),
                encoding="utf8",
            )
            (example_dir / "track.png").write_bytes(b"png")

            lines = render_example_gallery(
                str(repo_root),
                "examples/docs/demo",
                ["- [Demo Track](demo.md) track.json"],
            )

        html = "\n".join(lines)
        self.assertIn("Longer gallery description.", html)
        self.assertNotIn("Short gallery title.", html)


if __name__ == "__main__":
    unittest.main()
