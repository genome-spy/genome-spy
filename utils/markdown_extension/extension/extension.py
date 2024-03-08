import logging
import json
import os
import re

from markdown.preprocessors import Preprocessor
from markdown.extensions import Extension

types_with_links = {
    'ExprRef': 'https://genomespy.app/docs/grammar/expressions/'
}

refPattern = re.compile('^#/definitions/(\\w+)$')

def propTypeToString(propType):
    const = propType.get('const')
    type = propType.get('type')
    ref = propType.get('$ref')

    if const:
        if type == 'string':
            return '`"{}"`'.format(const)
        else:
            return '`{}`'.format(const)
    if type:
        if type == 'array':
            items = propType.get('items')
            if items:
                if propType.get('minItems') == 2 and propType.get('maxItems') == 2:
                    return '[{}, {}]'.format(propTypeToString(items), propTypeToString(items))
                else:
                    return propTypeToString(items) + '[]'
            else:
                return type
        else:
            return str(type)
    if ref:
        m = refPattern.match(ref)
        if m:
            refType = m.group(1)
            if refType in types_with_links:
                return '[{}]({})'.format(refType, types_with_links[refType])
            else:
                return '`{}`'.format(refType)
    return str(propType)

def propTypesToString(propTypes):
    return ' | '.join([propTypeToString(p) for p in propTypes])

class MyPreprocessor(Preprocessor):
    def __init__(self, schema):
        self.schema = schema
        self.pattern = re.compile('^SCHEMA (\\w+)$')

    def run(self, lines):
        new_lines = []
        for line in lines:
            m = self.pattern.match(line)
            if m:
                new_lines.extend(self.getType(m.group(1)))
            else:
                new_lines.append(line)

        return new_lines

    def getType(self, type_name):
        type = self.schema['definitions'][type_name]
        if not type:
            return ['Unknown type: ' + type_name]
        
        lines = []

        requiredFields = type.get('required', [])

        properties = type['properties']
        for (property, value) in properties.items():
            if value.get('const', "") != "":
                # Skip contants such as types of transforms
                continue

            dt = '`{}`'.format(property)
            if property in requiredFields:
                dt = dt + ' <span class="required">Required</span>'
            lines.append(dt)

            paragraphs = value.get('description', 'TODO').split('\n\n')

            propType = value.get('type')
            if propType:
                paragraphs.insert(0, 'Type: ' + propType)
            
            propTypes = value.get('anyOf')
            if propTypes:
                paragraphs.insert(0, 'Type: ' + propTypesToString(propTypes))

            for lineno, description_line in enumerate(paragraphs):
                lines.append((':   ' if lineno == 0 else '    ') + description_line)
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
