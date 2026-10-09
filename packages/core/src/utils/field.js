import { field as vegaField, accessor, splitAccessPath } from "vega-util";
import { annotateSpecError } from "./specError.js";

/**
 * Creates an accessor function based on the field expression.
 * This is equivalent to vega-util's field function but generates optimized
 * accessors for trivial cases.
 *
 * Function calls with polymorphic objects spoil the inline caching that
 * virtually all JavaScript engines use. Thus, we generate code and compile
 * always a new function to "guarantee" homomorphims, given that only same
 * type of objects are even passed to the accessor.
 *
 * Read more at: https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html
 *
 * @param {string} fieldExpr
 * @param {string} [name]
 * @param {import("../types/embedApi.js").SpecLocation} [location]
 */
export function field(fieldExpr, name, location) {
    const path = splitAccessPath(fieldExpr);
    if (path.length === 1) {
        const fieldName = path[0];
        const validate = (
            /** @type {import("../data/flowNode.js").Datum} */ datum
        ) => validateField(datum, fieldName, location);

        const fn = /** @type {import("vega-util").AccessorFn} */ (
            new Function(
                "validator",
                `
                let validated = !validator;
                return function accessField(datum) {
                    if (!validated) {
                        validator(datum);
                        validated = true;
                    }
                    return datum[${JSON.stringify(fieldName)}];
                }`
            )(validate)
        );
        return accessor(fn, [fieldName], name ?? fieldName);
    } else {
        // TODO: Should implement validation here as well
        return vegaField(fieldExpr);
    }
}

/**
 * Requires the property to exist, allowing an undefined value.
 * @param {any} obj
 * @param {string} prop
 * @param {import("../types/embedApi.js").SpecLocation | undefined} location
 */
export function validateField(obj, prop, location) {
    if (prop in obj) return;

    throw annotateSpecError(
        new Error(
            `Invalid field "${prop}". Available fields or properties: ${Object.keys(obj).join(", ")}`
        ),
        location
    );
}
