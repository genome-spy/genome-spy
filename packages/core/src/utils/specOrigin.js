/** @type {WeakMap<object, {source: object, path?: readonly (string | number)[]}>} */
const originals = new WeakMap();

/**
 * Associates a normalized or generated declaration with its authored source.
 * @template {object} T
 * @param {object} source
 * @param {T} copy
 * @param {readonly (string | number)[]} [path] Authored property represented by
 * the entire generated declaration.
 * @returns {T}
 */
export function inheritSpecOrigin(source, copy, path) {
    const original = originals.get(source);
    originals.set(copy, {
        source: original?.source ?? source,
        path: path ?? original?.path,
    });
    return copy;
}

/**
 * Clones a declaration subtree, preserving the exact source-to-copy mapping.
 * Only use for copies that retain authored field/expression meanings.
 * @template T
 * @param {T} source
 * @returns {T}
 */
export function cloneWithSpecOrigin(source) {
    const copy = structuredClone(source);
    /** @param {any} source @param {any} copy */
    function link(source, copy) {
        if (!source || typeof source !== "object" || originals.has(copy))
            return;
        inheritSpecOrigin(source, copy);
        for (const key of Object.keys(source)) link(source[key], copy[key]);
    }
    link(source, copy);
    return copy;
}

/**
 * @param {object | undefined} fragment
 * @param {((fragment: object) => string | undefined) | undefined} getOrigin
 * @param {readonly (string | number)[]} path
 * @returns {import("../types/embedApi.js").SpecLocation | undefined}
 */
export function getSpecLocation(fragment, getOrigin, path) {
    if (!fragment || !getOrigin) return;
    const original = originals.get(fragment);
    const origin = getOrigin(original?.source ?? fragment);
    return origin === undefined
        ? undefined
        : { origin, path: original?.path ?? path };
}
