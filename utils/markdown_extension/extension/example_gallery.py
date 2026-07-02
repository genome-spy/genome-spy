import html
import json
import os
import re
import shlex
from typing import Any


gallery_item_pattern = re.compile(r'^\s*-\s+\[([^\]]+)\]\(([^)]+)\)\s+(.+?)\s*$')


GalleryCard = dict[str, str]


def render_example_gallery(
    repo_root: str,
    argument_string: str,
    item_lines: list[str],
) -> list[str]:
    try:
        tokens = shlex.split(argument_string)
    except ValueError as exc:
        return ['Invalid EXAMPLE_GALLERY arguments: {}'.format(exc)]

    if not tokens:
        return ['Invalid EXAMPLE_GALLERY usage: missing example directory']

    base_path = tokens[0]
    if not base_path.startswith('examples/docs/'):
        return [
            'Only `examples/docs/...` paths are supported in EXAMPLE_GALLERY macros. Got `{}`.'.format(
                base_path
            )
        ]

    image_root = '../../examples'
    for token in tokens[1:]:
        if token.startswith('imageRoot='):
            image_root = token.split('=', 1)[1].rstrip('/')
        else:
            return ['Unknown EXAMPLE_GALLERY option: `{}`'.format(token)]

    if not item_lines:
        return ['Invalid EXAMPLE_GALLERY usage: missing gallery items']

    cards: list[GalleryCard] = []
    for item_line in item_lines:
        card = parse_gallery_item(repo_root, base_path, image_root, item_line)
        if isinstance(card, str):
            return [card]
        cards.append(card)

    lines = ['<div class="example-gallery">']
    for card in cards:
        lines.extend(render_gallery_card(card))
    lines.append('</div>')

    return lines


def parse_gallery_item(
    repo_root: str,
    base_path: str,
    image_root: str,
    item_line: str,
) -> GalleryCard | str:
    match = gallery_item_pattern.match(item_line)
    if not match:
        return 'Invalid EXAMPLE_GALLERY item: {}'.format(item_line)

    title, href, spec_file = match.groups()
    if '/' in spec_file or not spec_file.endswith('.json'):
        return 'Invalid EXAMPLE_GALLERY spec file: {}'.format(spec_file)

    spec_path = base_path.rstrip('/') + '/' + spec_file
    source_path = os.path.join(repo_root, *spec_path.split('/'))
    thumbnail_path = spec_path[:-5] + '.png'
    thumbnail_source_path = os.path.join(repo_root, *thumbnail_path.split('/'))

    if not os.path.exists(source_path):
        return 'Cannot open example file: {}'.format(spec_path)

    if not os.path.exists(thumbnail_source_path):
        return 'Missing EXAMPLE_GALLERY thumbnail: {}'.format(thumbnail_path)

    try:
        with open(source_path, 'r') as f:
            spec = json.load(f)
    except ValueError as exc:
        return 'Cannot parse example file {}: {}'.format(spec_path, exc)

    return {
        'title': title,
        'href': normalize_markdown_href(href),
        'description': get_description(spec),
        'thumbnail': image_root + '/' + thumbnail_path.removeprefix('examples/'),
    }


def normalize_markdown_href(href: str) -> str:
    if href.endswith('.md'):
        return href[:-3] + '/'

    return href


def render_gallery_card(card: GalleryCard) -> list[str]:
    return [
        '  <a class="example-gallery-card" href="{}">'.format(
            html.escape(card['href'], quote=True)
        ),
        '    <img src="{}" alt="" loading="lazy" decoding="async" />'.format(
            html.escape(card['thumbnail'], quote=True)
        ),
        '    <span class="example-gallery-title">{}</span>'.format(
            html.escape(card['title'])
        ),
        '    <span class="example-gallery-description">{}</span>'.format(
            html.escape(card['description'])
        ),
        '  </a>',
    ]


def get_description(spec: dict[str, Any]) -> str:
    description = spec.get('description')
    if isinstance(description, list):
        if len(description) >= 2 and isinstance(description[1], str):
            return description[1].strip()

        for line in description:
            if isinstance(line, str) and line.strip():
                return line.strip()
    elif isinstance(description, str):
        return description.strip()

    return ''
