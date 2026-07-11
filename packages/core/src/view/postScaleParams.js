/**
 * Scale-dependent bindings for macro-generated parameters. The parameters are
 * declared during view construction so descendant expressions can resolve
 * them, while their targets are bound after scale resolution.
 *
 * @typedef {{ name: string, expr: string }} PostScaleParam
 *
 * @type {WeakMap<object, PostScaleParam[]>}
 */
const postScaleParams = new WeakMap();

/**
 * @param {object} spec
 * @param {PostScaleParam[]} params
 */
export function setPostScaleParams(spec, params) {
    postScaleParams.set(spec, params);
}

/**
 * @param {object} spec
 * @returns {PostScaleParam[] | undefined}
 */
export function getPostScaleParams(spec) {
    return postScaleParams.get(spec);
}
