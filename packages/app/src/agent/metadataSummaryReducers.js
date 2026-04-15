const DEFAULT_MAX_CATEGORIES = 15;
const categoryCollator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
});

/**
 * @param {unknown[]} values
 * @returns {{
 *     nonMissingCount: number;
 *     missingCount: number;
 *     min?: number;
 *     max?: number;
 *     mean?: number;
 * }}
 */
export function buildQuantitativeFieldSummary(values) {
    let nonMissingCount = 0;
    let missingCount = 0;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const value of values) {
        const numericValue = coerceNumericValue(value);
        if (numericValue === undefined) {
            missingCount++;
            continue;
        }

        nonMissingCount++;
        min = Math.min(min, numericValue);
        max = Math.max(max, numericValue);
        sum += numericValue;
    }

    return {
        nonMissingCount,
        missingCount,
        ...(nonMissingCount > 0
            ? {
                  min,
                  max,
                  mean: sum / nonMissingCount,
              }
            : {}),
    };
}

/**
 * @param {unknown[]} values
 * @returns {{
 *     nonMissingCount: number;
 *     missingCount: number;
 *     distinctCount: number;
 *     categories: Array<{ value: unknown; count: number }>;
 *     truncated: boolean;
 * }}
 */
export function buildCategoricalFieldSummary(values) {
    /** @type {Map<unknown, number>} */
    const counts = new Map();
    let nonMissingCount = 0;
    let missingCount = 0;

    for (const value of values) {
        if (isMissingValue(value)) {
            missingCount++;
            continue;
        }

        nonMissingCount++;
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    const categories = Array.from(counts.entries())
        .sort(compareCategoryEntries)
        .slice(0, DEFAULT_MAX_CATEGORIES)
        .map(([value, count]) => ({
            value,
            count,
        }));

    return {
        nonMissingCount,
        missingCount,
        distinctCount: counts.size,
        categories,
        truncated: counts.size > DEFAULT_MAX_CATEGORIES,
    };
}

/**
 * @param {[unknown, number]} a
 * @param {[unknown, number]} b
 * @returns {number}
 */
function compareCategoryEntries(a, b) {
    if (b[1] !== a[1]) {
        return b[1] - a[1];
    }

    return categoryCollator.compare(String(a[0]), String(b[0]));
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function coerceNumericValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : undefined;
    }

    return undefined;
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
