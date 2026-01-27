import { quantile } from "d3-array";

/**
 * Compute Tukey boxplot statistics (R-style whiskers via fences) for an array of objects.
 *
 * - Quartiles via d3-array quantile on the sorted numeric values.
 * - Fences: [Q1 - coef*IQR, Q3 + coef*IQR]
 * - Whiskers: most extreme observed values within fences
 * - Outliers: input objects whose value is outside fences
 *
 * @template T
 * @param {T[]} data - Array of input objects.
 * @param {(d: T) => number | null | undefined} accessor - Extracts the numeric value from each object.
 * @param {object} [opts]
 * @param {number} [opts.coef=1.5] - Whisker coefficient (1.5 is the usual Tukey default). Use 0 for min/max, no outliers.
 * @param {boolean} [opts.dropNaN=true] - If true, drop non-finite values (NaN, ±Infinity, null/undefined).
 * @returns {{
 *   statistics: {
 *     n: number,
 *     nValid: number,
 *     q1: number,
 *     median: number,
 *     q3: number,
 *     iqr: number,
 *     lowerFence: number,
 *     upperFence: number,
 *     lowerWhisker: number,
 *     upperWhisker: number,
 *     min: number,
 *     max: number
 *   } | null,
 *   outliers: T[]
 * }}
 */
export function boxplotStats(data, accessor, opts = {}) {
    const { coef = 1.5, dropNaN = true } = opts;

    /** @type {{ obj: any, v: number }[]} */
    const pairs = [];
    for (const obj of data) {
        const v = accessor(obj);
        const num = typeof v === "number" ? v : Number(v);
        if (dropNaN) {
            if (!Number.isFinite(num)) continue;
        }
        pairs.push({ obj, v: num });
    }

    if (pairs.length === 0) {
        return { statistics: null, outliers: [] };
    }

    // Sort by value (copy not needed, pairs is new)
    pairs.sort((a, b) => a.v - b.v);

    const values = pairs.map((p) => p.v);

    // d3-array quantile expects a sorted array for performance/accuracy assumptions.
    const q1 = quantile(values, 0.25);
    const median = quantile(values, 0.5);
    const q3 = quantile(values, 0.75);

    // d3.quantile can return undefined for empty arrays, but we already handled that.
    if (q1 == null || median == null || q3 == null) {
        return { statistics: null, outliers: [] };
    }

    const iqr = q3 - q1;

    const lowerFence = q1 - coef * iqr;
    const upperFence = q3 + coef * iqr;

    const min = values[0];
    const max = values[values.length - 1];

    let lowerWhisker = min;
    let upperWhisker = max;

    /** @type {any[]} */
    const outliers = [];

    if (coef === 0) {
        // R behavior: whiskers to extremes, and no outliers returned.
        lowerWhisker = min;
        upperWhisker = max;
    } else {
        // Whiskers: most extreme observed values within fences.
        // Lower whisker: first value >= lowerFence
        let li = 0;
        while (li < values.length && values[li] < lowerFence) li++;
        lowerWhisker = values[Math.min(li, values.length - 1)];

        // Upper whisker: last value <= upperFence
        let ui = values.length - 1;
        while (ui >= 0 && values[ui] > upperFence) ui--;
        upperWhisker = values[Math.max(ui, 0)];

        // Outliers: objects outside fences (strictly outside)
        // Keep original objects (subset of input objects), not the numeric pairs.
        for (const p of pairs) {
            if (p.v < lowerFence || p.v > upperFence) outliers.push(p.obj);
        }
    }

    return {
        statistics: {
            n: data.length,
            nValid: pairs.length,
            q1,
            median,
            q3,
            iqr,
            lowerFence,
            upperFence,
            lowerWhisker,
            upperWhisker,
            min,
            max,
        },
        outliers,
    };
}
