import { field as vegaField, accessor } from "vega-util";

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
 */
export function field(fieldExpr, name = fieldExpr) {
    if (/^[A-Za-z0-9_]+$/.test(fieldExpr)) {
        const validate = function (
            /** @type {import("../data/flowNode.js").Datum} */ datum
        ) {
            if (!(fieldExpr in datum)) {
                logMissingProperty(datum, fieldExpr);
            }
        };

        // eslint-disable-next-line no-new-func
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
                    return datum[${JSON.stringify(fieldExpr)}];
                }`
            )(validate)
        );
        return accessor(fn, [fieldExpr], name);
    } else {
        // TODO: Should implement validation here as well
        return vegaField(fieldExpr);
    }
}

/**
 *
 * @param {any} obj
 * @param {string} prop
 */
function logMissingProperty(obj, prop) {
    throw new Error(
        `Invalid field "${prop}". Available fields or properties: ${Object.keys(obj).join(", ")}`
    );
}
