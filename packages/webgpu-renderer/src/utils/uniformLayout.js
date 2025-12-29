/**
 * @typedef {{ name: string, type: "f32"|"u32"|"i32", components: 1|2|4 }} UniformSpec
 * @typedef {UniformSpec & { offset: number }} UniformEntry
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
        const alignment =
            spec.components === 1 ? 4 : spec.components === 2 ? 8 : 16;
        const size = spec.components === 1 ? 4 : spec.components === 2 ? 8 : 16;
        offset = alignTo(offset, alignment);
        entries.set(spec.name, { ...spec, offset });
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
