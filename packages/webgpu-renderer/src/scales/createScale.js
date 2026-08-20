/**
 * @param {import("../index.d.ts").ScaleDef} definition
 * @param {import("../index.d.ts").ScaleOptions} options
 * @returns {import("../index.d.ts").DefinedChannelScale}
 */
export function createScale(definition, options) {
    return {
        ...options,
        type: definition.type,
        definition,
    };
}
