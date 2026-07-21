/**
 * @typedef {object} AuxiliaryDataInput
 * @prop {import("../../spec/data.js").DataSource} data
 * @prop {import("../../spec/transform.js").TransformParams[]} transforms
 */

/**
 * @param {import("../../spec/transform.js").TransformParamsBase} params
 */
export function hasAuxiliaryDataInput(params) {
    return params.type == "lookup" || params.type == "coordinateLookup";
}

/**
 * Returns the source branch required by a transform, if any.
 *
 * @param {import("../../spec/transform.js").TransformParams} params
 * @returns {AuxiliaryDataInput | undefined}
 */
export function getAuxiliaryDataInput(params) {
    if (params.type == "lookup") {
        const lookup =
            /** @type {import("../../spec/transform.js").LookupParams} */ (
                params
            );
        if ("lazy" in lookup.from) {
            throw new Error("Lookup tables cannot use lazy data sources.");
        }
        return { data: lookup.from, transforms: [] };
    } else if (params.type == "coordinateLookup") {
        const lookup =
            /** @type {import("../../spec/transform.js").CoordinateLookupParams} */ (
                params
            );
        return {
            data: lookup.from.data,
            transforms: lookup.from.transform ?? [],
        };
    }
}
