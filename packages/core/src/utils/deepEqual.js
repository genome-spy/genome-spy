/**
 * Deep equality for JSON-like values (primitives, arrays, plain objects).
 *
 * Notes:
 * - Non-plain objects (Date, Map, Set, class instances, etc.) are compared by
 *   reference (`Object.is`), not by value.
 * - Circular references are not supported.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export default function deepEqual(a, b) {
    if (Object.is(a, b)) {
        return true;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    if (!isPlainObject(a) || !isPlainObject(b)) {
        return false;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const key of keysA) {
        if (
            !Object.prototype.hasOwnProperty.call(b, key) ||
            !deepEqual(a[key], b[key])
        ) {
            return false;
        }
    }

    return true;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
