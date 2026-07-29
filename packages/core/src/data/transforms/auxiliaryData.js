import { isSelfLookup } from "./lookup.js";

/**
 * @typedef {object} AuxiliaryDataInput
 * @prop {import("../../spec/data.js").Data} data
 * @prop {import("../../spec/transform.js").TransformParams[]} transforms
 */

/**
 * @param {import("../../spec/transform.js").TransformParamsBase} params
 */
export function hasAuxiliaryDataInput(params) {
    return (
        (params.type == "lookup" &&
            !isSelfLookup(
                /** @type {import("../../spec/transform.js").LookupParams} */ (
                    params
                )
            )) ||
        params.type == "coordinateLookup" ||
        params.type == "cross"
    );
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
        if (isSelfLookup(lookup)) {
            return;
        }
        if ("lazy" in lookup.from) {
            throw new Error("Lookup tables cannot use lazy data sources.");
        }
        return {
            data: /** @type {import("../../spec/data.js").DataSource} */ (
                lookup.from
            ),
            transforms: [],
        };
    } else if (params.type == "coordinateLookup") {
        const lookup =
            /** @type {import("../../spec/transform.js").CoordinateLookupParams} */ (
                params
            );
        return {
            data: lookup.from.data,
            transforms: lookup.from.transform ?? [],
        };
    } else if (params.type == "cross") {
        const cross =
            /** @type {import("../../spec/transform.js").CrossParams} */ (
                params
            );
        if ("lazy" in cross.from.data) {
            throw new Error("Cross cannot use lazy foreign data.");
        }
        return {
            data: cross.from.data,
            transforms: cross.from.transform ?? [],
        };
    }
}
