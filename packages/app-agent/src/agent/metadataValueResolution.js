const DEFAULT_MAX_RESULTS = 10;
const exactCollator = new Intl.Collator("en", {
    usage: "search",
    sensitivity: "base",
});

/**
 * Resolve a free-text metadata value query against current visible categorical
 * sample metadata values.
 *
 * @param {{
 *     sampleHierarchy: import("@genome-spy/app/agentShared").SampleHierarchy | undefined;
 *     getAttributeInfo: (
 *         attribute: import("@genome-spy/app/agentShared").AttributeIdentifier
 *     ) => import("@genome-spy/app/agentShared").AttributeInfo | undefined;
 *     query: string;
 *     maxResults?: number;
 * }} options
 * @returns {Array<{
 *     attribute: import("@genome-spy/app/agentShared").AttributeIdentifier;
 *     title: string | import("lit").TemplateResult;
 *     dataType: string;
 *     matchedValue: unknown;
 *     matchType: "exact" | "levenshtein";
 *     distance?: number;
 *     visibleSampleCount: number;
 * }>}
 */
export function resolveMetadataValueMatches(options) {
    const { sampleHierarchy, getAttributeInfo, query } = options;
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    if (!sampleHierarchy) {
        return [];
    }

    const normalizedQuery = normalizeSearchString(query);
    if (!normalizedQuery) {
        return [];
    }

    const visibleSampleIds = collectVisibleSampleIds(sampleHierarchy.rootGroup);
    /** @type {ReturnType<typeof buildMatchCandidate>[]} */
    const exactMatches = [];
    /** @type {ReturnType<typeof buildMatchCandidate>[]} */
    const fuzzyMatches = [];

    for (const attributeName of sampleHierarchy.sampleMetadata.attributeNames) {
        const attribute = {
            type: "SAMPLE_ATTRIBUTE",
            specifier: attributeName,
        };
        const info = getAttributeInfo(attribute);
        if (!info || !isCategoricalAttributeType(info.type)) {
            continue;
        }

        const valueSummaries = collectVisibleAttributeValueSummaries(
            sampleHierarchy,
            visibleSampleIds,
            attributeName
        );

        for (const valueSummary of valueSummaries) {
            const normalizedValue = normalizeSearchString(
                String(valueSummary.matchedValue)
            );
            if (!normalizedValue) {
                continue;
            }

            if (exactCollator.compare(normalizedValue, normalizedQuery) === 0) {
                exactMatches.push(
                    buildMatchCandidate(
                        info,
                        valueSummary.matchedValue,
                        valueSummary.visibleSampleCount,
                        "exact"
                    )
                );
                continue;
            }

            const maxDistance = getMaximumLevenshteinDistance(normalizedQuery);
            if (maxDistance === 0) {
                continue;
            }

            const distance = computeLevenshteinDistance(
                normalizedQuery,
                normalizedValue,
                maxDistance
            );
            if (distance === undefined) {
                continue;
            }

            fuzzyMatches.push(
                buildMatchCandidate(
                    info,
                    valueSummary.matchedValue,
                    valueSummary.visibleSampleCount,
                    "levenshtein",
                    distance
                )
            );
        }
    }

    if (exactMatches.length > 0) {
        return exactMatches.sort(compareMatchCandidates).slice(0, maxResults);
    }

    return fuzzyMatches.sort(compareMatchCandidates).slice(0, maxResults);
}

/**
 * @param {import("@genome-spy/app/agentShared").AttributeInfo} info
 * @param {unknown} matchedValue
 * @param {number} visibleSampleCount
 * @param {"exact" | "levenshtein"} matchType
 * @param {number} [distance]
 */
function buildMatchCandidate(
    info,
    matchedValue,
    visibleSampleCount,
    matchType,
    distance
) {
    return {
        attribute: info.attribute,
        title: info.title,
        dataType: info.type,
        matchedValue,
        matchType,
        ...(distance !== undefined ? { distance } : {}),
        visibleSampleCount,
    };
}

/**
 * @param {import("@genome-spy/app/agentShared").SampleHierarchy} sampleHierarchy
 * @param {string[]} sampleIds
 * @param {string} attributeName
 * @returns {Array<{ matchedValue: unknown; visibleSampleCount: number }>}
 */
function collectVisibleAttributeValueSummaries(
    sampleHierarchy,
    sampleIds,
    attributeName
) {
    /** @type {Map<string, { matchedValue: unknown; visibleSampleCount: number }>} */
    const countsByValueKey = new Map();

    for (const sampleId of sampleIds) {
        const value =
            sampleHierarchy.sampleMetadata.entities[sampleId]?.[attributeName];
        if (isMissingValue(value)) {
            continue;
        }

        const valueKey = JSON.stringify([typeof value, value]);
        const existing = countsByValueKey.get(valueKey);
        if (existing) {
            existing.visibleSampleCount += 1;
            continue;
        }

        countsByValueKey.set(valueKey, {
            matchedValue: value,
            visibleSampleCount: 1,
        });
    }

    return Array.from(countsByValueKey.values());
}

/**
 * @param {import("@genome-spy/app/agentShared").Group} rootGroup
 * @returns {string[]}
 */
function collectVisibleSampleIds(rootGroup) {
    /** @type {Set<string>} */
    const sampleIds = new Set();

    /**
     * @param {import("@genome-spy/app/agentShared").Group} group
     */
    const visit = (group) => {
        if ("samples" in group) {
            for (const sampleId of group.samples) {
                sampleIds.add(sampleId);
            }
            return;
        }

        for (const child of group.groups) {
            visit(child);
        }
    };

    visit(rootGroup);
    return Array.from(sampleIds);
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeSearchString(value) {
    return value.trim().toLocaleLowerCase("en");
}

/**
 * @param {string} query
 * @returns {number}
 */
function getMaximumLevenshteinDistance(query) {
    if (query.length < 5) {
        return 0;
    }

    if (query.length < 8) {
        return 1;
    }

    return 2;
}

/**
 * @param {string} left
 * @param {string} right
 * @param {number} maxDistance
 * @returns {number | undefined}
 */
function computeLevenshteinDistance(left, right, maxDistance) {
    const lengthDifference = Math.abs(left.length - right.length);
    if (lengthDifference > maxDistance) {
        return undefined;
    }

    /** @type {number[]} */
    let previous = Array.from(
        { length: right.length + 1 },
        (_, index) => index
    );
    /** @type {number[]} */
    let current = new Array(right.length + 1);

    for (let row = 1; row <= left.length; row += 1) {
        current[0] = row;
        let rowMinimum = current[0];

        for (let column = 1; column <= right.length; column += 1) {
            const substitutionCost =
                left[row - 1] === right[column - 1] ? 0 : 1;
            const insertion = current[column - 1] + 1;
            const deletion = previous[column] + 1;
            const substitution = previous[column - 1] + substitutionCost;
            const value = Math.min(insertion, deletion, substitution);
            current[column] = value;
            if (value < rowMinimum) {
                rowMinimum = value;
            }
        }

        if (rowMinimum > maxDistance) {
            return undefined;
        }

        [previous, current] = [current, previous];
    }

    const distance = previous[right.length];
    return distance <= maxDistance ? distance : undefined;
}

/**
 * @param {ReturnType<typeof buildMatchCandidate>} a
 * @param {ReturnType<typeof buildMatchCandidate>} b
 * @returns {number}
 */
function compareMatchCandidates(a, b) {
    if (a.matchType !== b.matchType) {
        return a.matchType === "exact" ? -1 : 1;
    }

    if (a.distance !== b.distance) {
        return (a.distance ?? 0) - (b.distance ?? 0);
    }

    if (a.visibleSampleCount !== b.visibleSampleCount) {
        return b.visibleSampleCount - a.visibleSampleCount;
    }

    return String(a.attribute.specifier).localeCompare(
        String(b.attribute.specifier),
        "en"
    );
}

/**
 * @param {string} dataType
 * @returns {boolean}
 */
function isCategoricalAttributeType(dataType) {
    return dataType === "nominal" || dataType === "ordinal";
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMissingValue(value) {
    return (
        value === null ||
        value === undefined ||
        (typeof value === "number" && Number.isNaN(value))
    );
}
