/**
 * @typedef {object} UniformSpec
 * @prop {string} name
 * @prop {import("../types.js").ScalarType} type
 * @prop {1|2|4} components
 * @prop {number} [arrayLength]
 *
 * @typedef {UniformSpec & { offset: number, stride?: number }} UniformEntry
 *
 * @typedef {{ entries: Map<string, UniformEntry>, byteLength: number }} UniformLayout
 */

/**
 * Builds a std140-like uniform layout for 32-bit scalars, vec2, and vec4.
 *
 * @param {UniformSpec[]} specs
 * @returns {UniformLayout}
 */
export function buildUniformLayout(specs) {
    const entries = new Map();
    let offset = 0;
    for (const spec of specs) {
        const isArray = spec.arrayLength != null;
        const alignment = isArray
            ? 16
            : spec.components === 1
              ? 4
              : spec.components === 2
                ? 8
                : 16;
        const size = isArray
            ? 16 * spec.arrayLength
            : spec.components === 1
              ? 4
              : spec.components === 2
                ? 8
                : 16;
        const stride = isArray ? 16 : undefined;
        offset = alignTo(offset, alignment);
        entries.set(spec.name, { ...spec, offset, stride });
        offset += size;
    }
    return {
        entries,
        byteLength: alignTo(offset, 16),
    };
}

/**
 * @param {number} value
 * @param {number} alignment
 * @returns {number}
 */
export function alignTo(value, alignment) {
    return Math.ceil(value / alignment) * alignment;
}
