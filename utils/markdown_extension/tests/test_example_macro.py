import json
import tempfile
import unittest
from pathlib import Path

from extension.extension import MyPreprocessor


class ExampleMacroTest(unittest.TestCase):
    def create_preprocessor(self, repo_root):
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

    def test_app_runtime_is_emitted(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            preprocessor = self.create_preprocessor(Path(tmpdir))

            lines = preprocessor.getExample(
                'examples/docs/demo/track.json runtime=app height=200 spechidden'
            )

        html = '\n'.join(lines)
        self.assertIn('runtime="app"', html)
        self.assertIn('height="200"', html)
        self.assertIn('spechidden="true"', html)
        self.assertNotIn('$schema', html)

    def test_core_runtime_remains_implicit(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            preprocessor = self.create_preprocessor(Path(tmpdir))

            lines = preprocessor.getExample('examples/docs/demo/track.json')

        self.assertNotIn('runtime=', '\n'.join(lines))

    def test_rejects_unknown_runtime(self):
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
