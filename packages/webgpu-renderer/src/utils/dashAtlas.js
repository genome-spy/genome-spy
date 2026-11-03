/**
 * @typedef {object} DashAtlas
 * @property {Uint8Array} data
 * @property {number} width
 * @property {number} height
 * @property {number} patternCount
 */

export const DASH_MAX_PATTERN_COUNT = 256;
export const DASH_MAX_PATTERN_LENGTH = 256;
export const DASH_ATLAS_WIDTH = DASH_MAX_PATTERN_LENGTH * 4 + 1;

/**
 * Build a dash atlas texture for rule-style line patterns.
 *
 * Each rgba8uint row starts with a two-byte period, an all-on flag, and a
 * no-positive-length-dash flag. Four texels per logical sample store the left
 * and right intervals, first including zero-length dashes, then excluding them.
 * Butt caps use the latter pair because zero-length butt dashes have no body.
 * Endpoints are two-byte integers relative to that sample, biased by 256.
 * Keep both neighbors: a containing run can clip empty at a finite rule endpoint
 * while the preceding run still contributes a border. Zero-length gaps are merged.
 *
 * @param {number[][] | null | undefined} patterns
 * @returns {DashAtlas}
 */
export function buildDashAtlas(patterns) {
    if (!patterns || patterns.length === 0) {
        return {
            data: new Uint8Array(4),
            width: 1,
            height: 1,
            patternCount: 0,
        };
    }

    if (patterns.length > DASH_MAX_PATTERN_COUNT) {
        throw new Error(
            `Dash pattern count (${patterns.length}) exceeds ${DASH_MAX_PATTERN_COUNT}.`
        );
    }

    const data = new Uint8Array(DASH_ATLAS_WIDTH * patterns.length * 4);

    patterns.forEach((pattern, row) => {
        if (!Array.isArray(pattern) || pattern.length === 0) {
            throw new Error(
                `Dash pattern at index ${row} must be a non-empty array.`
            );
        }
        if (pattern.length % 2 !== 0) {
            throw new Error(
                `Dash pattern at index ${row} must have an even number of segments.`
            );
        }

        let length = 0;
        for (const segment of pattern) {
            if (!Number.isFinite(segment) || Math.round(segment) !== segment) {
                throw new Error(
                    `Dash pattern at index ${row} must use integer segment lengths.`
                );
            }
            if (segment < 0) {
                throw new Error(
                    `Dash pattern at index ${row} must use segments >= 0.`
                );
            }
            length += segment;
        }

        if (length === 0) {
            throw new Error(
                `Dash pattern at index ${row} must have a positive total length.`
            );
        }

        if (length > DASH_MAX_PATTERN_LENGTH) {
            throw new Error(
                `Dash pattern at index ${row} has length ${length}, which exceeds ${DASH_MAX_PATTERN_LENGTH}.`
            );
        }

        const base = row * DASH_ATLAS_WIDTH * 4;
        data[base] = length & 255;
        data[base + 1] = length >> 8;
        /** @type {[number, number][]} */
        const runs = [];
        let position = 0;
        for (let segment = 0; segment < pattern.length; segment++) {
            const end = position + pattern[segment];
            if (segment % 2 === 0) {
                const previous = runs.at(-1);
                if (previous && previous[1] === position) previous[1] = end;
                else runs.push([position, end]);
            }
            position = end;
        }
        if (runs.length === 1 && runs[0][1] - runs[0][0] === length) {
            data[base + 2] = 1;
            return;
        }
        // Joining at the periodic seam also removes redundant zero-length caps.
        if (runs.length > 1 && runs[0][0] === 0 && runs.at(-1)[1] === length) {
            runs[0][0] = runs.pop()[0] - length;
        }
        const positiveRuns = runs.filter(([start, end]) => start < end);
        data[base + 3] = positiveRuns.length === 0 ? 1 : 0;
        for (const [table, intervals] of [runs, positiveRuns].entries()) {
            if (intervals.length === 0) continue;
            const repeated = [-1, 0, 1].flatMap((cycle) =>
                intervals.map(([start, end]) => [
                    start + cycle * length,
                    end + cycle * length,
                ])
            );
            for (let x = 0; x < length; x++) {
                // At an on-start keep its predecessor too: after finite-path clipping,
                // the containing dash may vanish while that predecessor's border survives.
                const left = repeated.findLast(
                    ([start, end]) => start < x || (start === x && end === x)
                );
                const right = repeated.find(([, end]) => end > x);
                for (const [side, interval] of [left, right].entries()) {
                    const address = base + (1 + x * 4 + table * 2 + side) * 4;
                    const a = interval[0] - x + 256;
                    const b = interval[1] - x + 256;
                    data.set([a & 255, a >> 8, b & 255, b >> 8], address);
                }
            }
        }
    });

    return {
        data,
        width: DASH_ATLAS_WIDTH,
        height: patterns.length,
        patternCount: patterns.length,
    };
}
