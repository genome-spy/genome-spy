/** @type {WeakMap<object, object>} Explicit identity-preserving normalization copies. */
const originals = new WeakMap();

/**
 * Associates a shallow normalization copy with its authored declaration.
 * @template T
 * @param {unknown} source
 * @param {T} copy
 * @returns {T}
 */
export function inheritSpecOrigin(source, copy) {
    if (
        source &&
        copy &&
        typeof source === "object" &&
        typeof copy === "object" &&
        source !== copy
    ) {
        originals.set(copy, originals.get(source) ?? source);
    }
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
        if (!source || typeof source !== "object") return;
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
    const origin = getOrigin(originals.get(fragment) ?? fragment);
    return origin === undefined ? undefined : { origin, path };
}
