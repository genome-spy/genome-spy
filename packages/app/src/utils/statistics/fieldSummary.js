import { quantileSorted } from "d3-array";

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
 *     median?: number;
 *     p05?: number;
 *     p95?: number;
 *     q1?: number;
 *     q3?: number;
 *     iqr?: number;
 * }}
 */
export function buildQuantitativeFieldSummary(values) {
    /** @type {number[]} */
    const numericValues = [];
    let nonMissingCount = 0;
    let missingCount = 0;
    let sum = 0;

    for (const value of values) {
        const numericValue = coerceNumericValue(value);
        if (numericValue === undefined) {
            missingCount++;
            continue;
        }

        nonMissingCount++;
        numericValues.push(numericValue);
        sum += numericValue;
    }

    numericValues.sort((a, b) => a - b);

    const min = numericValues[0];
    const max = numericValues[numericValues.length - 1];
    const p05 = quantileSorted(numericValues, 0.05);
    const p95 = quantileSorted(numericValues, 0.95);
    const q1 = quantileSorted(numericValues, 0.25);
    const median = quantileSorted(numericValues, 0.5);
    const q3 = quantileSorted(numericValues, 0.75);

    return {
        nonMissingCount,
        missingCount,
        ...(nonMissingCount > 0
            ? {
                  min,
                  max,
                  mean: sum / nonMissingCount,
                  median,
                  p05,
                  p95,
                  q1,
                  q3,
                  iqr: q3 - q1,
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
 *     categories: Array<{ value: unknown; count: number; share: number }>;
 *     truncated: boolean;
 *     otherCount?: number;
 *     otherShare?: number;
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

    return buildCategoricalCountsSummary(counts, nonMissingCount, missingCount);
}

/**
 * @param {Map<unknown, number>} counts
 * @param {number} nonMissingCount
 * @param {number} missingCount
 * @param {number} [maxCategories]
 * @returns {{
 *     nonMissingCount: number;
 *     missingCount: number;
 *     distinctCount: number;
 *     categories: Array<{ value: unknown; count: number; share: number }>;
 *     truncated: boolean;
 *     otherCount?: number;
 *     otherShare?: number;
 * }}
 */
export function buildCategoricalCountsSummary(
    counts,
    nonMissingCount,
    missingCount,
    maxCategories = DEFAULT_MAX_CATEGORIES
) {
    const sortedCategories = Array.from(counts.entries()).sort(
        compareCategoryEntries
    );
    const categories = sortedCategories
        .slice(0, maxCategories)
        .map(([value, count]) => ({
            value,
            count,
            share: nonMissingCount > 0 ? count / nonMissingCount : 0,
        }));
    const otherCount = sortedCategories
        .slice(maxCategories)
        .reduce((sum, [, count]) => sum + count, 0);
    const truncated = counts.size > maxCategories;

    return {
        nonMissingCount,
        missingCount,
        distinctCount: counts.size,
        categories,
        truncated,
        ...(truncated
            ? {
                  otherCount,
                  otherShare:
                      nonMissingCount > 0 ? otherCount / nonMissingCount : 0,
              }
            : {}),
    };
}

/**
 * @param {Map<unknown, number>} counts
 * @param {number} nonMissingCount
 * @returns {{ value: unknown, count: number, share: number } | undefined}
 */
export function buildTopCategorySummary(counts, nonMissingCount) {
    const topEntry = Array.from(counts.entries()).sort(
        compareCategoryEntries
    )[0];

    return topEntry
        ? {
              value: topEntry[0],
              count: topEntry[1],
              share: nonMissingCount > 0 ? topEntry[1] / nonMissingCount : 0,
          }
        : undefined;
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
