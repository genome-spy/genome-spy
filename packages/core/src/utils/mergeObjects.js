/* eslint-disable max-depth */
import { isObject } from "vega-util";

/**
 * Deep merge.
 *
 * A boolean true and an object are compatible. The object survives, the boolean is overwritten.
 *
 * @param  {T[]} objects Objects to merge
 * @param {string} propertyOf What are we merging? Used in warning messages
 * @param {string[]} [skip] Fields to skip. TODO: Support nested fields.
 * @returns {T}
 * @template T
 */
export default function mergeObjects(objects, propertyOf, skip) {
    skip = skip || [];

    if (objects.some((d) => d === null)) {
        if (objects.every((d) => d === null)) {
            return null;
        } else {
            console.warn(objects);
            throw new Error("Cannot merge objects with nulls!");
        }
    }

    /** @type {any} */
    const target = {};

    /** @type {function(any, any):boolean} */
    const compatible = (a, b) =>
        a === b ||
        (isPlainObject(a) && isPlainObject(b)) ||
        (isPlainObject(a) && b === true) ||
        (a === true && isObject(b)) ||
        (Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((v, i) => v === b[i]));

    /** @param {any} obj */
    const merger = (obj) => {
        // eslint-disable-next-line guard-for-in
        for (let prop in obj) {
            const sourceValue = obj[prop];
            if (!skip.includes(prop) && sourceValue !== undefined) {
                if (
                    target[prop] !== undefined &&
                    !compatible(target[prop], sourceValue)
                ) {
                    console.warn(
                        `Conflicting property ${prop} of ${propertyOf}: (${JSON.stringify(
                            target[prop]
                        )} and ${JSON.stringify(
                            obj[prop]
                        )}). Using ${JSON.stringify(target[prop])}.`
                    );
                } else {
                    const targetValue = target[prop];

                    if (isPlainObject(targetValue)) {
                        if (isPlainObject(sourceValue)) {
                            // Object merged to object
                            target[prop] = mergeObjects(
                                [targetValue, sourceValue],
                                prop
                            );
                        }
                    } else if (isPlainObject(sourceValue)) {
                        if (
                            !(targetValue === true || targetValue === undefined)
                        ) {
                            throw new Error(
                                "Bug in merge! Target is: " + targetValue
                            );
                        }
                        // Object replaces "true"
                        target[prop] = mergeObjects([{}, sourceValue], prop);
                    } else {
                        // Scalar
                        target[prop] = sourceValue;
                    }
                }
            }
        }
    };

    for (const o of objects) {
        merger(o);
    }

    return target;
}

/**
 *
 * @param {any} x
 */
function isPlainObject(x) {
    return isObject(x) && !Array.isArray(x);
}
