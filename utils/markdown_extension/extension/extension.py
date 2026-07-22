import logging
import json
import os
import re
import shlex
from urllib.parse import unquote

from markdown.preprocessors import Preprocessor
from markdown.extensions import Extension

from .example_gallery import render_example_gallery

# TODO: Don't use absolute URLs. Instead generate relative links.
docs_baseurl = 'https://genomespy.app/docs'

types_with_links = {
    'Encoding': '/grammar/mark/#encoding',
    'ExprRef': '/grammar/expressions/',
    'SizeDef': '/grammar/composition/concat/#sizedef',
    'Step': '/grammar/composition/concat/#child-sizing',
    'VariableParameter': '/grammar/parameters/',
    'SelectionParameter': '/grammar/parameters/',
    'UrlImport': '/grammar/import/#urlimport',
    'TemplateImport': '/grammar/import/#templateimport',
    'MarkConfig': '/grammar/mark/#properties',
    'PointConfig': '/grammar/mark/point/#properties',
    'RectConfig': '/grammar/mark/rect/#properties',
    'RuleConfig': '/grammar/mark/rule/#properties',
    'TickConfig': '/grammar/mark/tick/#properties',
    'TextConfig': '/grammar/mark/text/#properties',
    'LinkConfig': '/grammar/mark/link/#properties',
    'LinkProps': '/grammar/mark/link/#properties',
    'PointProps': '/grammar/mark/point/#properties',
    'RectProps': '/grammar/mark/rect/#properties',
    'RuleProps': '/grammar/mark/rule/#properties',
    'TickProps': '/grammar/mark/tick/#properties',
    'TextProps': '/grammar/mark/text/#properties',
    'AxisConfig': '/grammar/scale/#axes',
    'ScaleConfig': '/grammar/scale/#scale-defaults',
    'RangeConfig': '/grammar/scale/#scale-defaults',
    'TitleConfig': '/grammar/config/#title-and-view-defaults',
    'ViewConfig': '/grammar/config/#title-and-view-defaults',
    'StyleConfig': '/grammar/config/#theme-config-and-style',
    'GenomeSpyConfig': '/grammar/config/#properties',
    'UrlData': '/grammar/data/eager/',
    'InlineData': '/grammar/data/eager/',
    'NamedData': '/grammar/data/eager/',
    'Generator': '/grammar/data/eager/',
    'LazyData': '/grammar/data/lazy/',
    'default': '/grammar/types/',
}

types_with_descriptions = {
    'Field': 'string (field name)',
}

refPattern = re.compile('^#/definitions/(.+)$')
schemaLinePattern = re.compile(r'^\s*"\$schema"\s*:\s*".*",?\s*$')

class MyPreprocessor(Preprocessor):
    def __init__(self, md, schema, app_schema, repo_root):
        super().__init__(md)
        self.schema = schema
        self.app_schema = app_schema
        self.repo_root = repo_root
        self.schema_pattern = re.compile(r'^(SCHEMA|APP_SCHEMA)\s+(\w+)(?:\s+(.+))?$')
        self.example_pattern = re.compile(r'^EXAMPLE\s+(.+)$')
        self.example_gallery_pattern = re.compile(r'^EXAMPLE_GALLERY(?:\s+(.+))?$')
        self.snippet_pattern = re.compile(r'^SNIPPET\s+(.+)$')

    def run(self, lines):
        new_lines = []
        index = 0
        while index < len(lines):
            line = lines[index]
            m = self.schema_pattern.match(line)
            example_match = self.example_pattern.match(line)
            example_gallery_match = self.example_gallery_pattern.match(line)
            snippet_match = self.snippet_pattern.match(line)
            if m:
                prop_list = []
                if m.group(3):
                    prop_list = m.group(3).split()
                schema = self.schema if m.group(1) == 'SCHEMA' else self.app_schema
                new_lines.extend(self.getType(m.group(2), prop_list, schema))
            elif example_match:
                new_lines.extend(self.getExample(example_match.group(1)))
            elif example_gallery_match:
                item_lines = []
                index += 1
                while index < len(lines) and lines[index].strip() == '':
                    index += 1
                while index < len(lines) and lines[index].lstrip().startswith('- '):
                    item_lines.append(lines[index])
                    index += 1
                new_lines.extend(
                    render_example_gallery(
                        self.repo_root,
                        example_gallery_match.group(1) or '',
                        item_lines,
                    )
                )
                continue
            elif snippet_match:
                new_lines.extend(self.getSnippet(snippet_match.group(1)))
            else:
                new_lines.append(line)

            index += 1

        return new_lines

    def getExample(self, argument_string):
        try:
            tokens = shlex.split(argument_string)
        except ValueError as exc:
            return ['Invalid EXAMPLE arguments: {}'.format(exc)]

        if not tokens:
            return ['Invalid EXAMPLE usage: missing example path']

        example_path = tokens[0]

        height = None
        spec_hidden = False
        runtime = 'core'

        for token in tokens[1:]:
            if token == 'spechidden':
                spec_hidden = True
            elif token.startswith('height='):
                height = token.split('=', 1)[1]
            elif token.startswith('runtime='):
                runtime = token.split('=', 1)[1]
                if runtime not in ('core', 'app'):
                    return [
                        'Invalid EXAMPLE runtime: `{}`. Use `core` or `app`.'.format(
                            runtime
                        )
                    ]
            else:
                return ['Unknown EXAMPLE option: `{}`'.format(token)]

        supports_docs_example = example_path.startswith('examples/docs/')
        supports_app_example = (
            runtime == 'app' and example_path.startswith('examples/app/')
        )
        if not supports_docs_example and not supports_app_example:
            return [
                'Only `examples/docs/...` paths are supported in EXAMPLE macros. '
                'Use `runtime=app` for `examples/app/...` paths. Got `{}`.'.format(
                    example_path
                )
            ]

        source_path = os.path.join(self.repo_root, *example_path.split('/'))

        try:
            with open(source_path, 'r') as f:
                spec_text = f.read()
        except IOError:
            return ['Cannot open example file: {}'.format(example_path)]

        try:
            json.loads(spec_text)
        except ValueError as exc:
            return ['Cannot parse example file {}: {}'.format(example_path, exc)]

        try:
            spec_text = self.stripSchemaLine(spec_text)
        except ValueError as exc:
            return ['Cannot preprocess example file {}: {}'.format(example_path, exc)]

        base_url = 'examples/'

        attributes = [
            'base-url="{}"'.format(base_url),
        ]
        if runtime == 'core':
            playground_spec_path = '/docs/' + example_path
            attributes.append(
                'playground-url="/playground/?spec={}"'.format(
                    playground_spec_path
                )
            )
        if height:
            attributes.append('height="{}"'.format(height))
        if spec_hidden:
            attributes.append('spechidden="true"')
        if runtime == 'app':
            attributes.append('runtime="app"')

        lines = ['<div><genome-spy-doc-embed {}>'.format(' '.join(attributes)), '']
        lines.append('```json')
        lines.extend(spec_text.splitlines())
        lines.extend(
            [
                '```',
                '',
                '</genome-spy-doc-embed></div>',
            ]
        )

        return lines

    def getSnippet(self, argument_string):
        try:
            tokens = shlex.split(argument_string)
        except ValueError as exc:
            return ['Invalid SNIPPET arguments: {}'.format(exc)]

        if not tokens:
            return ['Invalid SNIPPET usage: missing snippet path']

        snippet_path = tokens[0]
        generated_dir = os.path.join(self.repo_root, 'docs', 'generated-snippets')
        normalized_path = os.path.normpath(snippet_path)
        source_path = os.path.abspath(os.path.join(generated_dir, normalized_path))

        if not source_path.startswith(os.path.abspath(generated_dir) + os.sep):
            return ['Only `docs/generated-snippets/...` paths are supported in SNIPPET macros.']

        try:
            with open(source_path, 'r') as f:
                snippet_text = f.read().rstrip('\n')
        except IOError:
            return ['Cannot open snippet file: {}'.format(snippet_path)]

        language = self.getSnippetLanguage(source_path)
        fence_attributes = self.formatFenceAttributes(tokens[1:])

        fence_header = '```{}'.format(language)
        if fence_attributes:
            fence_header += ' ' + ' '.join(fence_attributes)

        return [fence_header, *snippet_text.splitlines(), '```']

    def getSnippetLanguage(self, source_path):
        extension = os.path.splitext(source_path)[1]
        return {
            '.html': 'html',
            '.js': 'js',
            '.json': 'json',
            '.css': 'css',
        }.get(extension, 'text')

    def formatFenceAttributes(self, tokens):
        attributes = []

        for token in tokens:
            if '=' in token:
                key, value = token.split('=', 1)
                escaped_value = value.replace('"', '&quot;')
                attributes.append('{}="{}"'.format(key, escaped_value))
            else:
                attributes.append(token)

        return attributes

    def stripSchemaLine(self, spec_text):
        lines = spec_text.splitlines()
        stripped_lines = []
        removed_schema = False
        skip_blank_after_schema = False

        for line in lines:
            if not removed_schema and schemaLinePattern.match(line):
                removed_schema = True
                skip_blank_after_schema = True
                continue

            if skip_blank_after_schema and line.strip() == '':
                skip_blank_after_schema = False
                continue

            skip_blank_after_schema = False
            stripped_lines.append(line)

        stripped_text = '\n'.join(stripped_lines)
        if spec_text.endswith('\n'):
            stripped_text += '\n'

        json.loads(stripped_text)
        return stripped_text


    def refToString(self, ref, schema):
        m = refPattern.match(ref)
        if m:
            type_name = unquote(m.group(1))
            ref_type = schema['definitions'][type_name]
            any_of = ref_type.get('anyOf')
            enum = ref_type.get('enum')
            type = ref_type.get('type')

            if any_of:
                return self.propTypesToString(any_of, schema)
            if enum:
                if type == 'string':
                    return ' | '.join(['`"{}"`'.format(e) for e in enum])
                else:
                    return ' | '.join(['`{}`'.format(e) for e in enum])
            if type_name in types_with_descriptions:
                return types_with_descriptions[type_name]
            if type_name in types_with_links:
                return '[{}]({})'.format(type_name, docs_baseurl + types_with_links[type_name])
            else:
                return '[{}]({})'.format(type_name, docs_baseurl + types_with_links['default'])
        return ref

    def propTypeToString(self, prop_type, schema):
        const = prop_type.get('const')
        type = prop_type.get('type')
        ref = prop_type.get('$ref')

        if const:
            if type == 'string':
                return '`"{}"`'.format(const)
            else:
                return '`{}`'.format(const)

        if type:
            if type == 'array':
                items = prop_type.get('items')
                if items:
                    if prop_type.get('minItems') == 2 and prop_type.get('maxItems') == 2:
                        return '[{}, {}]'.format(
                            self.propTypeToString(items, schema),
                            self.propTypeToString(items, schema),
                        )
                    else:
                        string = self.propTypeToString(items, schema)
                        if "|" in string:
                            return '({})[]'.format(string)
                        else:
                            return '{}[]'.format(string)
                else:
                    return type
            else:
                return str(type)
        if ref:
            return self.refToString(ref, schema)
        return str(prop_type)

    def propTypesToString(self, propTypes, schema):
        return ' | '.join([self.propTypeToString(p, schema) for p in propTypes])

    def getType(self, type_name, included_properties=None, schema=None):
        if schema is None:
            schema = self.schema

        type = schema['definitions'].get(type_name)
        if not type:
            return ['Unknown type: ' + type_name]

        while '$ref' in type:
            m = refPattern.match(type['$ref'])
            if not m:
                return ['Unknown type: ' + type_name]
            type = schema['definitions'].get(unquote(m.group(1)))
            if not type:
                return ['Unknown type: ' + type_name]
        
        lines = []

        required_fields = type.get('required', [])

        anyOf = type.get('anyOf')
        if anyOf:
            lines.append('Type: ' + self.propTypesToString(anyOf, schema))
            return lines

        enum = type.get('enum')
        if enum:
            if type.get('type') == 'string':
                lines.append('Type: ' + ' | '.join(['`"{}"`'.format(e) for e in enum]))
            else:
                lines.append('Type: ' + ' | '.join(['`{}`'.format(e) for e in enum]))
            return lines

        properties = type.get('properties')
        value_type = type.get('type')
        if value_type and not properties:
            if isinstance(value_type, list):
                lines.append('Type: ' + ' | '.join(value_type))
            else:
                lines.append('Type: ' + self.propTypeToString(type, schema))
            return lines

        if not properties:
            return ['No properties']

        selected_properties = properties.items()
        if included_properties:
            selected_properties = []
            for property in included_properties:
                value = properties.get(property)
                if not value:
                    lines.append(
                        'Unknown property: `{}` in type `{}`'.format(
                            property, type_name
                        )
                    )
                    continue
                selected_properties.append((property, value))

        for (property, value) in selected_properties:
            if value.get('const', "") != "":
                # Skip contants such as types of transforms
                continue

            dt = '`{}`'.format(property)
            if property in required_fields:
                dt = dt + ' <span class="required">Required</span>'
            lines.append(dt)

            paragraphs = value.get('description', 'TODO').split('\n\n')

            ref = value.get('$ref')
            if ref:
                paragraphs.insert(0, 'Type: ' + self.refToString(ref, schema))

            propType = value.get('type')
            if propType:
                if isinstance(propType, list):
                    propType = ' | '.join(propType)
                paragraphs.insert(0, 'Type: ' + propType)
            
            propTypes = value.get('anyOf')
            if propTypes:
                paragraphs.insert(0, 'Type: ' + self.propTypesToString(propTypes, schema))

            continuation_indent = '  '

            for lineno, paragraph in enumerate(paragraphs):
                paragraph_lines = paragraph.split('\n')
                for line_no, paragraph_line in enumerate(paragraph_lines):
                    if lineno == 0 and line_no == 0:
                        lines.append(':   ' + paragraph_line)
                    else:
                        lines.append(continuation_indent + paragraph_line)
                lines.append('')

        return lines


class GenomeSpyExtension(Extension):
    def __init__(self, **kwargs):
        self.config = {
            'schemaPath' : [ 'docs/schema.json', 'Path to core schema'],
            'appSchemaPath' : [ 'docs/app-schema.json', 'Path to app schema'],
            'repoRootPath' : [ '.', 'Path to repository root'],
        }
        super(GenomeSpyExtension, self).__init__(**kwargs)

    def extendMarkdown(self, md):
        try:
            with open(self.getConfig('schemaPath'), 'r') as f:
                schema = json.load(f)
        except IOError:
            logging.error('Cannot open ' + self.getConfig('schemaPath'))
            raise

        try:
            with open(self.getConfig('appSchemaPath'), 'r') as f:
                app_schema = json.load(f)
        except IOError:
            logging.warning(
                'Cannot open %s. APP_SCHEMA falls back to SCHEMA.',
                self.getConfig('appSchemaPath'),
            )
            app_schema = schema

        repo_root = os.path.abspath(self.getConfig('repoRootPath'))

        md.preprocessors.register(
            MyPreprocessor(md, schema, app_schema, repo_root),
            'GenomeSpy',
            175,
        )
