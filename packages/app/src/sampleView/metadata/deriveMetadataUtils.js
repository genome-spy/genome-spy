import { applyGroupToAttributeDefs } from "./metadataUtils.js";
import emptyToUndefined from "../../utils/emptyToUndefined.js";

/**
 * @typedef {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType} SampleAttributeType
 */

/**
 * @param {import("../types.js").AttributeInfo | null} attributeInfo
 * @param {{ strict?: boolean }} [options]
 * @returns {SampleAttributeType | null}
 */
export function resolveDataType(attributeInfo, options = {}) {
    if (!attributeInfo) {
        throw new Error("Attribute info is missing.");
    }

    const dataType = /** @type {SampleAttributeType} */ (attributeInfo.type);
    if (
        dataType === "nominal" ||
        dataType === "ordinal" ||
        dataType === "quantitative"
    ) {
        return dataType;
    }

    if (options.strict === false) {
        return null;
    }

    throw new Error("Unsupported data type: " + dataType);
}

/**
 * @param {string} attributeNameRaw
 * @param {string} groupPathRaw
 * @param {string[]} existingNames
 * @param {import("../types.js").AttributeInfo | null} attributeInfo
 * @returns {string | null}
 */
export function validateDerivedMetadataName(
    attributeNameRaw,
    groupPathRaw,
    existingNames,
    attributeInfo
) {
    const attributeName = attributeNameRaw.trim();
    if (attributeName.length === 0) {
        return "Attribute name is required.";
    }

    const groupPath = groupPathRaw.trim();
    const derivedName = deriveAttributeName(
        attributeName,
        groupPath,
        resolveDataType(attributeInfo)
    );
    if (existingNames.includes(derivedName)) {
        return "Name already exists. Choose another name or group.";
    }

    return null;
}

/**
 * @param {string} attributeName
 * @param {string} groupPath
 * @param {SampleAttributeType} dataType
 * @returns {string}
 */
export function deriveAttributeName(attributeName, groupPath, dataType) {
    /** @type {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} */
    const attributeDefs = {
        [attributeName]: {
            type: dataType,
        },
    };

    if (groupPath.length === 0) {
        return Object.keys(attributeDefs)[0];
    }

    const groupedDefs = applyGroupToAttributeDefs(attributeDefs, groupPath);
    return Object.keys(groupedDefs)[0];
}

/**
 * @param {import("../types.js").AttributeIdentifier} attribute
 * @param {{ name: string, groupPath: string, scale?: import("@genome-spy/core/spec/scale.js").Scale }} config
 * @returns {import("../state/payloadTypes.js").DeriveMetadata}
 */
export function buildDerivedMetadataIntent(attribute, config) {
    return {
        attribute,
        name: config.name,
        groupPath: emptyToUndefined(config.groupPath),
        scale: emptyToUndefined(config.scale),
    };
}

/**
 * Builds a unique derived attribute name within the length limit.
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {string[]} existingNames
 * @returns {string}
 */
export function createDerivedAttributeName(attributeInfo, existingNames) {
    const existing = new Set(existingNames);
    const base =
        attributeInfo.name && attributeInfo.name.length > 0
            ? attributeInfo.name.trim()
            : "Derived";

    const preferredLength = 20;
    /** @type {string[]} */
    const candidates = [];
    const shouldCompress = base.length > preferredLength;
    const compressed = shouldCompress
        ? compressAttributeName(base, preferredLength)
        : "";

    if (shouldCompress && compressed.length > 0 && compressed !== base) {
        candidates.push(compressed);
    }

    candidates.push(base);

    if (!shouldCompress && existing.has(base)) {
        const fallback = compressAttributeName(base, preferredLength);
        if (fallback.length > 0 && fallback !== base) {
            candidates.push(fallback);
        }
    }

    for (const candidate of candidates) {
        const unique = ensureUniqueName(candidate, existing);
        if (unique) {
            return unique;
        }
    }

    throw new Error("Unable to generate a unique metadata attribute name.");
}

/**
 * @param {string} name
 * @param {number} targetLength
 * @returns {string}
 */
function compressAttributeName(name, targetLength) {
    const tokens = tokenizeName(name);
    if (tokens.length === 0) {
        return name.trim();
    }

    const { prefix, restTokens } = extractOpPrefix(tokens);
    const separator = prefix && restTokens.length > 0 ? "_" : "";
    const availableLength = Math.max(
        0,
        targetLength - prefix.length - separator.length
    );

    if (restTokens.length === 0) {
        return prefix.length > 0 ? prefix : name.trim();
    }

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
        const edgeCandidate = formatAttributeTokens(
            [tokens[0], tokens[tokens.length - 1]],
            true
        );
        if (edgeCandidate !== compact) {
            candidates.push(edgeCandidate);
        }
    }

    for (let count = tokens.length - 1; count > 0; count -= 1) {
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
 * @param {string} baseName
 * @param {Set<string>} existing
 * @returns {string | null}
 */
function ensureUniqueName(baseName, existing) {
    if (!existing.has(baseName)) {
        return baseName;
    }

    for (let counter = 2; counter < Number.MAX_SAFE_INTEGER; counter += 1) {
        const suffix = "-" + String(counter);
        const candidate = appendSuffix(baseName, suffix);
        if (!existing.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * @param {string} baseName
 * @param {string} suffix
 * @returns {string}
 */
function appendSuffix(baseName, suffix) {
    const maxLength = 32;
    if (baseName.length + suffix.length <= maxLength) {
        return baseName + suffix;
    }

    const trimmedLength = Math.max(1, maxLength - suffix.length);
    return baseName.slice(0, trimmedLength) + suffix;
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
                return token;
            }

            return token[0].toUpperCase() + token.slice(1);
        })
        .join("");
}
