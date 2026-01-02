/**
 * @typedef {object} DashAtlas
 * @property {Uint8Array} data
 * @property {number} width
 * @property {number} height
 * @property {number} patternCount
 */

export const DASH_MAX_PATTERN_COUNT = 256;
export const DASH_MAX_PATTERN_LENGTH = 256;
export const DASH_ATLAS_WIDTH = DASH_MAX_PATTERN_LENGTH + 1;

/**
 * Build a dash atlas texture for rule-style line patterns.
 *
 * Each row represents one pattern. The first texel stores the pattern
 * length (in stroke-width units). Remaining texels store on/off samples.
 *
 * @param {number[][] | null | undefined} patterns
 * @returns {DashAtlas}
 */
export function buildDashAtlas(patterns) {
    if (!patterns || patterns.length === 0) {
        return {
            data: new Uint8Array([0]),
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

    const data = new Uint8Array(DASH_ATLAS_WIDTH * patterns.length);

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

        const base = row * DASH_ATLAS_WIDTH;
        data[base] = length;

        let cursor = 1;
        let on = true;
        for (const segment of pattern) {
            for (let i = 0; i < segment; i++) {
                data[base + cursor] = on ? 255 : 0;
                cursor++;
            }
            on = !on;
        }
    });

    return {
        data,
        width: DASH_ATLAS_WIDTH,
        height: patterns.length,
        patternCount: patterns.length,
    };
}
