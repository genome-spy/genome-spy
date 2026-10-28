/**
 * Policy-free bridge for optional capabilities. No optional implementation may
 * be imported here or by the code registering a public ViewApi.
 *
 * @typedef {object} ViewRuntime
 * @prop {() => void} ensureActive
 * @prop {() => import("./view.js").default} getRoot
 * @prop {(address: import("../types/embedApi.js").ViewAddress) => import("./view.js").default} getView
 * @prop {(view: import("./view.js").default) => import("../types/embedApi.js").ViewHandle} getHandle
 */

/** @type {WeakMap<import("../types/embedApi.js").ViewApi, ViewRuntime>} */
const runtimes = new WeakMap();

/** @param {import("../types/embedApi.js").ViewApi} api @param {ViewRuntime} runtime */
export function registerViewRuntime(api, runtime) {
    runtimes.set(api, runtime);
}

/** @param {import("../types/embedApi.js").ViewApi} api */
export function getViewRuntime(api) {
    const runtime = runtimes.get(api);
    if (!runtime)
        throw new Error("Expected a ViewApi owned by this Core runtime.");
    runtime.ensureActive();
    return runtime;
}
