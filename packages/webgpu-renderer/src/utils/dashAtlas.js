/**
 * @typedef {object} DashAtlas
 * @property {Uint8Array} data
 * @property {number} width
 * @property {number} height
 * @property {number} patternCount
 */

export const DASH_MAX_PATTERN_COUNT = 256;
export const DASH_MAX_PATTERN_LENGTH = 256;
export const DASH_ATLAS_WIDTH = DASH_MAX_PATTERN_LENGTH * 2 + 1;

/**
 * Build a dash atlas texture for rule-style line patterns.
 *
 * Each rgba8uint row starts with a two-byte period and an all-on/all-off flag.
 * Two texels per logical sample then store the left and right painted intervals.
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
        /** @type {boolean[]} */
        const mask = [];
        for (let segment = 0; segment < pattern.length; segment++) {
            for (let j = 0; j < pattern[segment]; j++)
                mask.push(segment % 2 === 0);
        }
        if (mask.every(Boolean) || mask.every((x) => !x)) {
            data[base + 2] = mask[0] ? 1 : 2;
            return;
        }
        /** @param {number} x */
        const on = (x) => mask[((x % length) + length) % length];
        for (let x = 0; x < length; x++) {
            for (const side of [0, 1]) {
                let at = side ? x : x - 1;
                while (!on(at)) at += side ? 1 : -1;
                let start = at,
                    end = at + 1;
                while (on(start - 1)) start--;
                while (on(end)) end++;
                const address = base + (1 + x * 2 + side) * 4;
                const left = start - x + 256,
                    right = end - x + 256;
                data.set(
                    [left & 255, left >> 8, right & 255, right >> 8],
                    address
                );
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
