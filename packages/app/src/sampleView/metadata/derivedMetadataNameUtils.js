/**
 * Generates a short, readable name by tokenizing the input and applying
 * heuristics (operator prefixes, compact tokens, camel-case joining).
 * @param {string} name
 * @param {number} targetLength
 * @returns {string}
 */
export function compressAttributeName(name, targetLength) {
    const tokens = tokenizeName(name);
    if (tokens.length === 0) {
        return name.trim();
    }

    // Preserve common aggregation op prefixes for readability (e.g., wMean, n).
    const { prefix, restTokens } = extractOpPrefix(tokens);
    const separator = prefix && restTokens.length > 0 ? "_" : "";
    const availableLength = Math.max(
        0,
        targetLength - prefix.length - separator.length
    );

    if (restTokens.length === 0) {
        return prefix.length > 0 ? prefix : name.trim();
    }

    // Prefer compact attribute tokens when a prefix is present to keep the name short.
    const attributePart = selectAttributeCandidate(
        restTokens,
        availableLength,
        prefix.length > 0
    );
    let candidate = prefix + separator + attributePart;

    if (separator && candidate.length > targetLength) {
        const noSeparator = prefix + attributePart;
        if (noSeparator.length <= targetLength) {
            candidate = noSeparator;
        }
    }

    if (candidate.length > targetLength) {
        return candidate.slice(0, targetLength);
    }

    return candidate;
}

/**
 * @param {string[]} tokens
 * @returns {{ prefix: string, restTokens: string[] }}
 */
function extractOpPrefix(tokens) {
    const normalized = tokens.map((token) => token.toLowerCase());
    const rules = [
        { match: ["weighted", "mean"], prefix: "wMean" },
        { match: ["item", "count"], prefix: "n" },
        { match: ["count"], prefix: "n" },
        { match: ["mean"], prefix: "mean" },
        { match: ["median"], prefix: "med" },
        { match: ["min"], prefix: "min" },
        { match: ["max"], prefix: "max" },
        { match: ["variance"], prefix: "var" },
        { match: ["stdev"], prefix: "sd" },
        { match: ["stddev"], prefix: "sd" },
        { match: ["sd"], prefix: "sd" },
        { match: ["sum"], prefix: "sum" },
    ];

    for (const rule of rules) {
        if (startsWithTokens(normalized, rule.match)) {
            return {
                prefix: rule.prefix,
                restTokens: tokens.slice(rule.match.length),
            };
        }
    }

    return { prefix: "", restTokens: tokens };
}

/**
 * @param {string[]} tokens
 * @param {string[]} match
 * @returns {boolean}
 */
function startsWithTokens(tokens, match) {
    if (tokens.length < match.length) {
        return false;
    }

    for (let index = 0; index < match.length; index += 1) {
        if (tokens[index] !== match[index]) {
            return false;
        }
    }

    return true;
}

/**
 * @param {string[]} tokens
 * @param {number} maxLength
 * @param {boolean} preferCompactFirst
 * @returns {string}
 */
function selectAttributeCandidate(tokens, maxLength, preferCompactFirst) {
    /** @type {string[]} */
    const candidates = [];
    const preferred = formatAttributeTokens(tokens, false);
    const compact = formatAttributeTokens(tokens, true);
    const ordered = preferCompactFirst
        ? [compact, preferred]
        : [preferred, compact];

    for (const candidate of ordered) {
        if (candidate.length > 0 && !candidates.includes(candidate)) {
            candidates.push(candidate);
        }
    }

    if (tokens.length > 2) {
        // If we have many tokens, try keeping the first and last as a fast hint.
        const edgeCandidate = formatAttributeTokens(
            [tokens[0], tokens[tokens.length - 1]],
            true
        );
        if (edgeCandidate !== compact) {
            candidates.push(edgeCandidate);
        }
    }

    for (let count = tokens.length - 1; count > 0; count -= 1) {
        // Gradually drop trailing tokens until it fits.
        const candidate = formatAttributeTokens(tokens.slice(0, count), true);
        if (!candidates.includes(candidate)) {
            candidates.push(candidate);
        }
    }

    for (const candidate of candidates) {
        if (candidate.length <= maxLength) {
            return candidate;
        }
    }

    return candidates[0].slice(0, maxLength);
}

/**
 * @param {string} name
 * @returns {string[]}
 */
function tokenizeName(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return [];
    }

    // Split on camelCase, digits, and punctuation, but keep alphanumerics.
    const withSpaces = trimmed
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
        .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
        .replace(/[^a-zA-Z0-9]+/g, " ");

    const stopWords = new Set([
        "the",
        "of",
        "and",
        "or",
        "for",
        "to",
        "a",
        "an",
    ]);
    return withSpaces
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .filter((token) => !stopWords.has(token.toLowerCase()));
}

/**
 * @param {string} token
 * @param {number} index
 * @param {boolean} preferCompact
 * @returns {string}
 */
function compressToken(token, index, preferCompact) {
    if (/^[A-Z0-9]+$/.test(token)) {
        return token;
    }

    if (preferCompact && index === 0) {
        // Keep a single-letter leading token for compact forms like pLogR.
        return token[0].toLowerCase();
    }

    if (token.length <= 4) {
        return token;
    }

    if (token.length <= 8) {
        return token.slice(0, 4);
    }

    return token.slice(0, 3);
}

/**
 * @param {string[]} tokens
 * @param {boolean} preferCompact
 * @returns {string}
 */
function formatAttributeTokens(tokens, preferCompact) {
    const compressed = tokens.map((token, index) =>
        compressToken(token, index, preferCompact)
    );
    return joinTokensCamel(compressed);
}

/**
 * @param {string[]} tokens
 * @returns {string}
 */
function joinTokensCamel(tokens) {
    return tokens
        .map((token, index) => {
            if (index === 0 || token.length === 0) {
                return token;
            }

            if (/^[A-Z0-9]+$/.test(token)) {
                // Preserve acronyms as-is.
                return token;
            }

            return token[0].toUpperCase() + token.slice(1);
        })
        .join("");
}
