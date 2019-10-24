import logging
import json
import os
import re

from markdown.preprocessors import Preprocessor
from markdown.extensions import Extension

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
            if len(value.get('enum', [])) == 1:
                # Skip contants such as types of transforms
                continue

            dt = '`{}`'.format(property)
            if property in requiredFields:
                dt = dt + ' <span class="required">Required</span>'
            lines.append(dt)

            for description_line in value.get('description', 'TODO').split('\n\n'):
                lines.append(':   ' + description_line)

            lines.append('')

        return lines


class GenomeSpyExtension(Extension):
    def __init__(self, **kwargs):
        self.config = {
            'schemaPath' : [ 'docs/genomespy-schema.json', 'Path to schema']
        }
        super(GenomeSpyExtension, self).__init__(**kwargs)

    def extendMarkdown(self, md):
        try:
            with open(self.getConfig('schemaPath'), 'r') as f:
                schema = json.load(f)
        except IOError:
            logging.error('Cannot open ' + self.getConfig('schemaPath'))
            return

        md.preprocessors.register(MyPreprocessor(schema), 'GenomeSpy', 175)