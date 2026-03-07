import { isObject } from "vega-util";

/**
 * @param {any} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
    return isObject(value) && !Array.isArray(value);
}

/**
 * @param {Record<string, any>} value
 * @returns {Record<string, any>}
 */
function cloneObject(value) {
    /** @type {Record<string, any>} */
    const clone = {};
    for (const [key, entry] of Object.entries(value)) {
        clone[key] = cloneValue(entry);
    }
    return clone;
}

/**
 * @param {any} value
 * @returns {any}
 */
function cloneValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneValue);
    }

    if (isPlainObject(value)) {
        return cloneObject(value);
    }

    return value;
}

/**
 * @param {Record<string, any>} target
 * @param {Record<string, any>} source
 */
function mergeInto(target, source) {
    for (const [key, sourceValue] of Object.entries(source)) {
        if (sourceValue === undefined) {
            continue;
        }

        const targetValue = target[key];

        if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
            mergeInto(targetValue, sourceValue);
        } else {
            target[key] = cloneValue(sourceValue);
        }
    }

    return target;
}

/**
 * Deep merges configuration objects using "last scope wins" precedence.
 *
 * @param {Array<Record<string, any> | undefined>} scopes
 * @returns {Record<string, any>}
 */
export function mergeConfigScopes(scopes) {
    /** @type {Record<string, any>} */
    const merged = {};

    for (const scope of scopes) {
        if (!scope) {
            continue;
        }

        mergeInto(merged, scope);
    }

    return merged;
}
