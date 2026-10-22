/** @type {WeakMap<object, {source: object, path?: readonly (string | number)[], declaringView?: import("../view/view.js").default}>} */
const originals = new WeakMap();

/**
 * Returns the lexical scope carried by an internal encoding definition.
 * @param {object} fragment
 */
export function getSpecDeclarationView(fragment) {
    return originals.get(fragment)?.declaringView;
}

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
        declaringView: original?.declaringView,
    });
    return copy;
}

/**
 * Clones a declaration subtree, preserving the exact source-to-copy mapping.
 * Only use for copies that retain authored field/expression meanings.
 * @template T
 * @param {T} source
 * @param {import("../view/view.js").default} [declaringView] Scope for a new view-owned encoding copy.
 * @returns {T}
 */
export function cloneWithSpecOrigin(source, declaringView) {
    const copy = structuredClone(source);
    /** @param {any} source @param {any} copy @param {import("../view/view.js").default | undefined} scope */
    function link(source, copy, scope) {
        if (!source || typeof source !== "object" || originals.has(copy))
            return;
        inheritSpecOrigin(source, copy);
        const origin = originals.get(copy);
        origin.declaringView = scope ?? origin.declaringView;
        for (const key of Object.keys(source))
            link(source[key], copy[key], origin.declaringView);
    }
    link(source, copy, declaringView);
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
