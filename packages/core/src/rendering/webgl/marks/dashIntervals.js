/**
 * Neighboring centerline intervals for GPU rule caps. Keep point dashes, which
 * have no sampled body but acquire a silhouette with round or square caps.
 * @param {number[] | undefined} pattern
 * @returns {{data: Float32Array, length: number}}
 */
export function createDashIntervals(pattern) {
    if (!pattern) return { data: new Float32Array(8), length: 0 };
    if (
        !pattern.length ||
        pattern.length % 2 ||
        pattern.some((s) => !Number.isInteger(s) || s < 0 || s > 1000) ||
        !pattern.some((s) => s > 0)
    ) {
        throw new Error(
            "Invalid stroke dash pattern: " + JSON.stringify(pattern)
        );
    }

    const length = pattern.reduce((a, b) => a + b, 0);
    if (pattern.every((s, i) => i % 2 === 0 || s === 0))
        return { data: new Float32Array(8), length: 0 };

    /** @type {[number, number][]} */
    const intervals = [];
    let position = 0;
    for (let i = 0; i < pattern.length; i++) {
        const end = position + pattern[i];
        if (i % 2 === 0) {
            const previous = intervals.at(-1);
            if (previous && previous[1] === position) previous[1] = end;
            else intervals.push([position, end]);
        }
        position = end;
    }
    // A zero gap at the period boundary is continuous too.
    if (
        intervals.length > 1 &&
        intervals[0][0] === 0 &&
        intervals.at(-1)[1] === length
    ) {
        intervals.at(-1)[1] = intervals.shift()[1] + length;
    }

    // Round/square caps include point dashes; butt caps need positive runs only.
    const data = new Float32Array(length * 8);
    for (let row = 0; row < 2; row++) {
        const runs = intervals.filter(([a, b]) => row === 0 || a < b);
        if (!runs.length) {
            for (let x = 0; x < length; x++)
                data.set([1, -1, 1, -1], (row * length + x) * 4);
            continue;
        }
        const repeated = [-length, 0, length].flatMap((offset) =>
            runs.map(([a, b]) => [a + offset, b + offset])
        );
        let right = 0;
        for (let x = 0; x < length; x++) {
            while (repeated[right][1] <= x) right++;
            const next = repeated[right];
            const previous = next[0] < x ? next : repeated[right - 1];
            data.set(
                [previous[0] - x, previous[1] - x, next[0] - x, next[1] - x],
                (row * length + x) * 4
            );
        }
    }
    return { data, length };
}
