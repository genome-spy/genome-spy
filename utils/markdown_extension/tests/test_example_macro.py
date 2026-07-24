import json
import tempfile
import unittest
from pathlib import Path

from extension.extension import MyPreprocessor


class ExampleMacroTest(unittest.TestCase):
    def create_preprocessor(self, repo_root: Path) -> MyPreprocessor:
        example_path = repo_root / 'examples' / 'docs' / 'demo' / 'track.json'
        example_path.parent.mkdir(parents=True)
        example_path.write_text(
            json.dumps(
                {
                    '$schema': 'https://example.com/schema.json',
                    'mark': 'point',
                },
                indent=2,
            ),
            encoding='utf8',
        )
        return MyPreprocessor(None, {}, {}, str(repo_root))

    def test_app_runtime_is_emitted(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            preprocessor = self.create_preprocessor(repo_root)
            app_example_path = repo_root / 'examples' / 'app' / 'track.json'
            app_example_path.parent.mkdir(parents=True)
            app_example_path.write_text('{"mark": "point"}', encoding='utf8')

            lines = preprocessor.getExample(
                'examples/app/track.json runtime=app height=200 spechidden'
            )

        html = '\n'.join(lines)
        self.assertIn('runtime="app"', html)
        self.assertIn('height="200"', html)
        self.assertIn('spechidden="true"', html)
        self.assertNotIn('playground-url=', html)
        self.assertNotIn('$schema', html)

    def test_core_runtime_remains_implicit(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            preprocessor = self.create_preprocessor(Path(tmpdir))

            lines = preprocessor.getExample('examples/docs/demo/track.json')

        html = '\n'.join(lines)
        self.assertNotIn('runtime=', html)
        self.assertIn('playground-url=', html)

    def test_rejects_app_example_without_app_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            preprocessor = self.create_preprocessor(Path(tmpdir))

            lines = preprocessor.getExample('examples/app/track.json')

        self.assertEqual(
            lines,
            [
                'Only `examples/docs/...` paths are supported in EXAMPLE macros. '
                'Use `runtime=app` for `examples/app/...` paths. Got '
                '`examples/app/track.json`.'
            ],
        )

    def test_rejects_unknown_runtime(self) -> None:
        preprocessor = MyPreprocessor(None, {}, {}, '')

        lines = preprocessor.getExample(
            'examples/docs/demo/track.json runtime=unknown'
        )

        self.assertEqual(
            lines,
            ['Invalid EXAMPLE runtime: `unknown`. Use `core` or `app`.'],
        )


if __name__ == '__main__':
    unittest.main()
