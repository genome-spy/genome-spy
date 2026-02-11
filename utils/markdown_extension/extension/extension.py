import logging
import json
import os
import re

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
class MyPreprocessor(Preprocessor):
    def __init__(self, schema):
        self.schema = schema
        self.pattern = re.compile(r'^SCHEMA\s+(\w+)(?:\s+(.+))?$')

    def run(self, lines):
        new_lines = []
        for line in lines:
            m = self.pattern.match(line)
            if m:
                prop_list = []
                if m.group(2):
                    prop_list = m.group(2).split()
                new_lines.extend(self.getType(m.group(1), prop_list))
            else:
                new_lines.append(line)

        return new_lines


    def refToString(self, ref):
        m = refPattern.match(ref)
        if m:
            type_name = m.group(1)
            ref_type = self.schema['definitions'][type_name]
            any_of = ref_type.get('anyOf')
            enum = ref_type.get('enum')
            type = ref_type.get('type')

            if any_of:
                return self.propTypesToString(any_of)
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

    def propTypeToString(self, prop_type):
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
                        return '[{}, {}]'.format(self.propTypeToString(items), self.propTypeToString(items))
                    else:
                        string = self.propTypeToString(items)
                        if "|" in string:
                            return '({})[]'.format(string)
                        else:
                            return '{}[]'.format(string)
                else:
                    return type
            else:
                return str(type)
        if ref:
            return self.refToString(ref)
        return str(prop_type)

    def propTypesToString(self, propTypes):
        return ' | '.join([self.propTypeToString(p) for p in propTypes])

    def getType(self, type_name, included_properties=None):
        type = self.schema['definitions'][type_name]
        if not type:
            return ['Unknown type: ' + type_name]
        
        lines = []

        required_fields = type.get('required', [])

        anyOf = type.get('anyOf')
        if anyOf:
            lines.append('Type: ' + self.propTypesToString(anyOf))
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
                paragraphs.insert(0, 'Type: ' + self.refToString(ref))

            propType = value.get('type')
            if propType:
                if isinstance(propType, list):
                    propType = ' | '.join(propType)
                paragraphs.insert(0, 'Type: ' + propType)
            
            propTypes = value.get('anyOf')
            if propTypes:
                paragraphs.insert(0, 'Type: ' + self.propTypesToString(propTypes))

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
            'schemaPath' : [ 'docs/schema.json', 'Path to schema']
        }
        super(GenomeSpyExtension, self).__init__(**kwargs)

    def extendMarkdown(self, md):
        try:
            with open(self.getConfig('schemaPath'), 'r') as f:
                schema = json.load(f)
        except IOError:
            logging.error('Cannot open ' + self.getConfig('schemaPath'))
            raise

        md.preprocessors.register(MyPreprocessor(schema), 'GenomeSpy', 175)
