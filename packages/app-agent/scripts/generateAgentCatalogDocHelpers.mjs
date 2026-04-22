// Shared doc parsing helpers for the agent generator scripts.

import ts from "typescript";

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeDocText(text) {
    return String(text ?? "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .join("\n")
        .trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
export function compactDocText(text) {
    return normalizeDocText(text).replace(/\s+/g, " ");
}

/**
 * @param {string} text
 * @returns {string}
 */
export function firstSentence(text) {
    const normalized = normalizeDocText(text);
    if (!normalized) {
        return "";
    }

    const match = normalized.match(/^(.+?[.!?])(?:\s|$)/s);
    if (match) {
        return compactDocText(match[1]);
    }

    return compactDocText(normalized.split(/\n\s*\n/)[0]);
}

/**
 * @param {ts.Node} node
 * @returns {{ summary: string, tags: Array<{ name: string, comment: string }> }}
 */
export function readJsDoc(node) {
    const doc = node.jsDoc?.[0];
    const summary = compactDocText(doc?.comment ?? "");
    const tags = (doc?.tags ?? []).map((tag) => ({
        name: tag.tagName.getText(),
        comment: normalizeDocText(tag.comment ?? ""),
    }));

    return { summary, tags };
}

/**
 * @param {Array<{ name: string, comment: string }>} tags
 * @returns {string[]}
 */
export function parseExamples(tags) {
    const examples = [];
    for (const tag of tags) {
        if (tag.name !== "example") {
            continue;
        }

        const exampleText = tag.comment.trim();
        if (!exampleText) {
            continue;
        }

        try {
            examples.push(JSON.parse(exampleText));
        } catch {
            throw new Error(
                "Could not parse @example JSON block:\n" + exampleText
            );
        }
    }

    return examples;
}
