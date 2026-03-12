import logging
import json
import os
import re
import shlex

from markdown.preprocessors import Preprocessor
from markdown.extensions import Extension

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
    'LinkProps': '/grammar/mark/link/#properties',
    'PointProps': '/grammar/mark/point/#properties',
    'RectProps': '/grammar/mark/rect/#properties',
    'RuleProps': '/grammar/mark/rule/#properties',
    'TextProps': '/grammar/mark/text/#properties',
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

refPattern = re.compile('^#/definitions/(\\w+)$')
schemaLinePattern = re.compile(r'^\s*"\$schema"\s*:\s*".*",?\s*$')

class MyPreprocessor(Preprocessor):
    def __init__(self, md, schema, app_schema, repo_root):
        super().__init__(md)
        self.schema = schema
        self.app_schema = app_schema
        self.repo_root = repo_root
        self.schema_pattern = re.compile(r'^(SCHEMA|APP_SCHEMA)\s+(\w+)(?:\s+(.+))?$')
        self.example_pattern = re.compile(r'^EXAMPLE\s+(.+)$')

    def run(self, lines):
        new_lines = []
        for line in lines:
            m = self.schema_pattern.match(line)
            example_match = self.example_pattern.match(line)
            if m:
                prop_list = []
                if m.group(3):
                    prop_list = m.group(3).split()
                schema = self.schema if m.group(1) == 'SCHEMA' else self.app_schema
                new_lines.extend(self.getType(m.group(2), prop_list, schema))
            elif example_match:
                new_lines.extend(self.getExample(example_match.group(1)))
            else:
                new_lines.append(line)

        return new_lines

    def getExample(self, argument_string):
        try:
            tokens = shlex.split(argument_string)
        except ValueError as exc:
            return ['Invalid EXAMPLE arguments: {}'.format(exc)]

        if not tokens:
            return ['Invalid EXAMPLE usage: missing example path']

        example_path = tokens[0]
        if not example_path.startswith('examples/docs/'):
            return [
                'Only `examples/docs/...` paths are supported in EXAMPLE macros. Got `{}`.'.format(
                    example_path
                )
            ]

        height = None
        spec_hidden = False

        for token in tokens[1:]:
            if token == 'spechidden':
                spec_hidden = True
            elif token.startswith('height='):
                height = token.split('=', 1)[1]
            else:
                return ['Unknown EXAMPLE option: `{}`'.format(token)]

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
        playground_spec_path = '/docs/' + example_path

        attributes = ['base-url="{}"'.format(base_url)]
        if height:
            attributes.append('height="{}"'.format(height))
        if spec_hidden:
            attributes.append('spechidden="true"')

        lines = ['<div><genome-spy-doc-embed {}>'.format(' '.join(attributes)), '']
        lines.append('```json')
        lines.extend(spec_text.splitlines())
        lines.extend(
            [
                '```',
                '',
                '</genome-spy-doc-embed></div>',
                '',
                '<p class="example-playground-link"><a href="/playground/?spec={}">Open in Playground</a></p>'.format(
                    playground_spec_path
                ),
                '',
            ]
        )

        return lines

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
            type_name = m.group(1)
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
        
        lines = []

        required_fields = type.get('required', [])

        anyOf = type.get('anyOf')
        if anyOf:
            lines.append('Type: ' + self.propTypesToString(anyOf, schema))
            return lines

        properties = type.get('properties')
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
