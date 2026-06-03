from __future__ import annotations

import json
import re
from typing import Any


def load_json_with_repair(content: str) -> Any:
    """Parse JSON after applying narrow repairs for common LLM truncation."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        repaired = repair_json(content)
        if repaired == content:
            raise

        return json.loads(repaired)


def repair_json(content: str) -> str:
    """Repair a narrow class of malformed JSON emitted by LLMs."""
    repaired = _extract_json_content(content)
    repaired = _collapse_duplicate_quote_delimiters(repaired)
    repaired = _normalize_json_tokens(repaired)
    repaired = _repair_truncated_json(repaired)
    return repaired


def _repair_truncated_json(content: str) -> str:
    """Append missing string terminators and structural closers."""
    stripped = content.rstrip()
    if not stripped.startswith(("{", "[")):
        return content

    repaired = stripped
    if _has_unterminated_json_string(repaired):
        repaired += '"'

    closers = _get_missing_json_closers(repaired)
    if closers:
        repaired += closers

    return repaired


def _has_unterminated_json_string(content: str) -> bool:
    """Return whether the JSON text ends inside a string literal."""
    in_string = False
    escaping = False

    for char in content:
        if escaping:
            escaping = False
            continue

        if char == "\\":
            escaping = True
            continue

        if char == '"':
            in_string = not in_string

    return in_string


def _get_missing_json_closers(content: str) -> str:
    """Return any trailing braces or brackets needed to balance the prefix."""
    stack: list[str] = []
    in_string = False
    escaping = False

    for char in content:
        if escaping:
            escaping = False
            continue

        if char == "\\":
            escaping = True
            continue

        if char == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in {"}", "]"} and stack and stack[-1] == char:
            stack.pop()

    stack.reverse()
    return "".join(stack)


def _normalize_json_tokens(content: str) -> str:
    """Normalize quasi-JSON tokens into JSON-compatible text."""
    repaired: list[str] = []
    stack: list[str] = []
    state_stack: list[str] = []
    index = 0

    while index < len(content):
        char = content[index]

        if char in {" ", "\t", "\n", "\r"}:
            repaired.append(char)
            index += 1
            continue

        if _starts_line_comment(content, index):
            index = _skip_line_comment(content, index)
            continue

        if _starts_block_comment(content, index):
            index = _skip_block_comment(content, index)
            continue

        if char in {'"', "'"}:
            if _is_duplicate_quote_delimiter(content, index):
                index += 1
                continue

            parsed_string, index = _parse_string(content, index)
            repaired.append(parsed_string)
            if _expects_object_key(stack, state_stack):
                state_stack[-1] = "colon"
            elif _expects_value(state_stack):
                _mark_value_complete(state_stack)
            continue

        if char == "{":
            if _expects_value(state_stack):
                _mark_value_complete(state_stack)
            repaired.append(char)
            stack.append("object")
            state_stack.append("key_or_end")
            index += 1
            continue

        if char == "[":
            if _expects_value(state_stack):
                _mark_value_complete(state_stack)
            repaired.append(char)
            stack.append("array")
            state_stack.append("value_or_end")
            index += 1
            continue

        if char == ":":
            repaired.append(char)
            if state_stack and state_stack[-1] == "colon":
                state_stack[-1] = "value"
            index += 1
            continue

        if char == ",":
            repaired.append(char)
            if stack:
                if stack[-1] == "object":
                    state_stack[-1] = "key_or_end"
                else:
                    state_stack[-1] = "value_or_end"
            index += 1
            continue

        if char in {"}", "]"}:
            _remove_trailing_comma(repaired)
            repaired.append(char)
            if stack:
                stack.pop()
                state_stack.pop()
            index += 1
            continue

        if _is_identifier_start(char):
            token, index = _parse_identifier(content, index)
            if token == "COMMENT":
                continue

            if _expects_object_key(stack, state_stack):
                next_char = _peek_next_significant_char(content, index)
                if next_char != ":":
                    continue
                repaired.append(json.dumps(token, ensure_ascii=False))
                state_stack[-1] = "colon"
                continue

            normalized_literal = _normalize_literal(token)
            repaired.append(normalized_literal)
            if _expects_value(state_stack):
                _mark_value_complete(state_stack)
            continue

        if char == "-" or char.isdigit():
            token, index = _parse_number_token(content, index)
            repaired.append(token)
            if _expects_value(state_stack):
                _mark_value_complete(state_stack)
            continue

        repaired.append(char)
        index += 1

    return "".join(repaired)


def _starts_line_comment(content: str, index: int) -> bool:
    """Return whether a line comment starts at the current offset."""
    return content.startswith("//", index)


def _starts_block_comment(content: str, index: int) -> bool:
    """Return whether a block comment starts at the current offset."""
    return content.startswith("/*", index)


def _skip_line_comment(content: str, index: int) -> int:
    """Advance past a line comment."""
    newline_index = content.find("\n", index)
    if newline_index < 0:
        return len(content)

    return newline_index


def _skip_block_comment(content: str, index: int) -> int:
    """Advance past a block comment."""
    end_index = content.find("*/", index + 2)
    if end_index < 0:
        return len(content)

    return end_index + 2


def _collapse_duplicate_quote_delimiters(content: str) -> str:
    """Collapse duplicated quote delimiters in malformed JSON wrappers."""
    content = re.sub(r'([{\[,:\s])"{2}(?=[A-Za-z_])', r'\1"', content)
    content = re.sub(r'(?<=[A-Za-z0-9_])"{2}([:\]},])', r'"\1', content)
    content = re.sub(r"([{\[,:\s])'{2}(?=[^'\s])", r"\1'", content)
    content = re.sub(r"'{2}(?=\s*[:\]},])", r"'", content)
    return content


def _extract_json_content(content: str) -> str:
    """Extract the most plausible JSON fragment from model output."""
    stripped = content.strip()
    if not stripped:
        return '""'

    fenced_match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL)
    if fenced_match:
        stripped = fenced_match.group(1).strip()
        if stripped:
            return stripped

    if stripped == "]":
        return "[]"

    start_index = _find_json_start(stripped)
    if start_index is not None:
        return stripped[start_index:]

    return '""'


def _find_json_start(content: str) -> int | None:
    """Return the first plausible JSON start offset."""
    for index, char in enumerate(content):
        if char in {"{", "["}:
            return index

    return None


def _parse_string(content: str, index: int) -> tuple[str, int]:
    """Parse a single- or double-quoted string and emit valid JSON."""
    quote = content[index]
    index += 1
    characters: list[str] = []
    escaping = False

    while index < len(content):
        char = content[index]
        index += 1

        if escaping:
            if char == "b":
                characters.append("\b")
            elif char == "f":
                characters.append("\f")
            elif char == "n":
                characters.append("\n")
            elif char == "r":
                characters.append("\r")
            elif char == "t":
                characters.append("\t")
            elif char == "u" and index + 4 <= len(content):
                unicode_escape = content[index : index + 4]
                if re.fullmatch(r"[0-9a-fA-F]{4}", unicode_escape):
                    characters.append(chr(int(unicode_escape, 16)))
                    index += 4
                else:
                    characters.append("u")
            elif char in {'"', "'", "\\", "/"}:
                characters.append(char)
            else:
                characters.append(char)

            escaping = False
            continue

        if char == "\\":
            escaping = True
            continue

        if char == quote:
            if _is_escaped_duplicate_quote(content, index - 1, quote):
                index += 1
                characters.append(quote)
                continue
            return json.dumps("".join(characters), ensure_ascii=False), index

        if quote == '"' and char == "'" and index < len(content):
            next_char = content[index]
            if next_char in {"}", "]", ",", ":"}:
                characters.append(char)
                continue

        if quote == '"' and char == '"' and _looks_like_inner_double_quote(
            content, index
        ):
            characters.append(char)
            continue

        characters.append(char)

    if escaping:
        characters.append("\\")

    return json.dumps("".join(characters), ensure_ascii=False), index


def _parse_identifier(content: str, index: int) -> tuple[str, int]:
    """Parse a bare identifier token."""
    start = index
    while index < len(content) and _is_identifier_part(content[index]):
        index += 1

    return content[start:index], index


def _parse_number_token(content: str, index: int) -> tuple[str, int]:
    """Parse a JSON number token."""
    start = index
    while index < len(content) and content[index] in "0123456789+-.eE":
        index += 1

    return content[start:index], index


def _is_identifier_start(char: str) -> bool:
    """Return whether the character may begin an identifier."""
    return char == "_" or char.isalpha()


def _is_identifier_part(char: str) -> bool:
    """Return whether the character may continue an identifier."""
    return char in {"_", "-", "$"} or char.isalnum()


def _normalize_literal(token: str) -> str:
    """Normalize JSON literals while quoting unknown identifiers."""
    lowered = token.lower()
    if lowered in {"true", "false", "null"}:
        return lowered

    return json.dumps(token, ensure_ascii=False)


def _expects_object_key(stack: list[str], state_stack: list[str]) -> bool:
    """Return whether the current token position expects an object key."""
    return bool(stack) and stack[-1] == "object" and state_stack[-1] == "key_or_end"


def _expects_value(state_stack: list[str]) -> bool:
    """Return whether the current token position expects a value."""
    return bool(state_stack) and state_stack[-1] in {"value", "value_or_end"}


def _mark_value_complete(state_stack: list[str]) -> None:
    """Advance the current container state after a value token."""
    if not state_stack:
        return

    state_stack[-1] = "comma_or_end"


def _remove_trailing_comma(repaired: list[str]) -> None:
    """Drop a trailing comma before a closing brace or bracket."""
    index = len(repaired) - 1
    while index >= 0 and repaired[index] in {" ", "\t", "\n", "\r"}:
        index -= 1

    if index >= 0 and repaired[index] == ",":
        del repaired[index]


def _is_duplicate_quote_delimiter(content: str, index: int) -> bool:
    """Return whether this quote is a duplicated structural delimiter."""
    quote = content[index]
    return (
        index + 1 < len(content)
        and content[index + 1] == quote
        and _peek_previous_significant_char(content, index) in {"{", "[", ",", ":"}
        and _looks_like_duplicate_delimiter_payload(content, index + 2)
    )


def _peek_next_significant_char(content: str, index: int) -> str | None:
    """Return the next non-whitespace, non-comment character."""
    while index < len(content):
        if content[index] in {" ", "\t", "\n", "\r"}:
            index += 1
            continue

        if _starts_line_comment(content, index):
            index = _skip_line_comment(content, index)
            continue

        if _starts_block_comment(content, index):
            index = _skip_block_comment(content, index)
            continue

        return content[index]

    return None


def _peek_previous_significant_char(content: str, index: int) -> str | None:
    """Return the previous non-whitespace character."""
    index -= 1
    while index >= 0:
        if content[index] in {" ", "\t", "\n", "\r"}:
            index -= 1
            continue

        return content[index]

    return None


def _looks_like_inner_double_quote(content: str, index: int) -> bool:
    """Return whether a double quote inside a double-quoted string is literal."""
    next_char = _peek_next_significant_char(content, index)
    return next_char not in {None, ",", "}", "]", ":"}


def _is_escaped_duplicate_quote(content: str, quote_index: int, quote: str) -> bool:
    """Return whether a repeated quote pair should collapse into one literal quote."""
    next_index = quote_index + 1
    if next_index >= len(content) or content[next_index] != quote:
        return False

    next_char = _peek_next_significant_char(content, next_index + 1)
    return next_char not in {None, ",", "}", "]", ":"}


def _looks_like_duplicate_delimiter_payload(content: str, index: int) -> bool:
    """Return whether text after a duplicated quote looks like a key or string."""
    next_char = _peek_next_significant_char(content, index)
    return next_char is not None and (
        _is_identifier_start(next_char) or next_char.isdigit()
    )
