/**
 * Connects the optional query entry to the view API's existing address resolver.
 * Both entries must use this module from the same Core instance.
 * @type {WeakMap<import("../types/embedApi.js").ViewApi, (address: import("../types/embedApi.js").ViewAddress) => import("./view.js").default>}
 */
export const viewQueryResolvers = new WeakMap();
