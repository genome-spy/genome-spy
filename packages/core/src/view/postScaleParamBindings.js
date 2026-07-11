/**
 * Scale-dependent bindings for macro-generated parameters. The parameters are
 * declared during view construction so descendant expressions can resolve
 * them, while their targets are bound after scale resolution.
 *
 * @typedef {{ name: string, expr: string }} PostScaleParamBinding
 *
 * @type {WeakMap<object, PostScaleParamBinding[]>}
 */
const postScaleParamBindings = new WeakMap();

/**
 * @param {object} spec
 * @param {PostScaleParamBinding[]} bindings
 */
export function setPostScaleParamBindings(spec, bindings) {
    postScaleParamBindings.set(spec, bindings);
}

/**
 * @param {object} spec
 * @returns {PostScaleParamBinding[] | undefined}
 */
export function getPostScaleParamBindings(spec) {
    return postScaleParamBindings.get(spec);
}
