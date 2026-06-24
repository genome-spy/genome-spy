import ConcatView from "./concatView.js";
import GridView from "./gridView/gridView.js";
import LayerView from "./layerView.js";
import UnitView from "./unitView.js";
import { getViewSelector, resolveViewSelector } from "./viewSelectors.js";

/**
 * Error thrown by the public view mutation API.
 */
export class ViewMutationError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = "ViewMutationError";

        /**
         * Stable error code for programmatic handling.
         */
        this.code = code;
    }
}

/**
 * Creates the public view mutation API for a GenomeSpy instance.
 *
 * @param {{ viewRoot: import("./view.js").default }} genomeSpy
 * @returns {import("../types/embedApi.js").ViewMutationApi}
 */
export function createViewMutationApi(genomeSpy) {
    /**
     * @typedef {import("../types/embedApi.js").ViewAddress} ViewAddress
     * @typedef {import("../types/embedApi.js").ViewHandle} ViewHandle
     * @typedef {import("../view/viewUtilTypes.d.ts").ViewSelector} ViewSelector
     */

    /** @type {WeakMap<import("./view.js").default, import("../types/embedApi.js").ViewHandle>} */
    const handlesByView = new WeakMap();

    /** @type {WeakMap<import("../types/embedApi.js").ViewHandle, import("./view.js").default>} */
    const viewsByHandle = new WeakMap();

    let nextHandleId = 0;
    let transactionDepth = 0;
    let queue = Promise.resolve();

    /**
     * @returns {import("./view.js").default}
     */
    function getRootView() {
        return genomeSpy.viewRoot;
    }

    /**
     * @param {import("./view.js").default} view
     * @returns {boolean}
     */
    function isLiveView(view) {
        const root = getRootView();
        return (
            view === root || Boolean(root?.getDescendants?.().includes(view))
        );
    }

    /**
     * @param {import("./view.js").default} view
     * @returns {import("../types/embedApi.js").ViewHandleType}
     */
    function getHandleType(view) {
        if (view instanceof ConcatView) {
            return "concat";
        } else if (view instanceof LayerView) {
            return "layer";
        } else if (view instanceof UnitView) {
            return "unit";
        } else if (view instanceof GridView) {
            return "grid";
        } else {
            return "unknown";
        }
    }

    /**
     * @param {import("./view.js").default} view
     * @returns {ViewSelector | undefined}
     */
    function getSelector(view) {
        if (!view.explicitName) {
            return undefined;
        }

        try {
            return getViewSelector(view);
        } catch {
            return undefined;
        }
    }

    /**
     * @param {import("./view.js").default} view
     * @returns {import("../types/embedApi.js").ViewHandle}
     */
    function getHandle(view) {
        let handle = handlesByView.get(view);
        if (handle) {
            return handle;
        }

        const id = "view-" + nextHandleId;
        nextHandleId++;

        handle = {
            id,

            get name() {
                return view.explicitName;
            },

            get selector() {
                return getSelector(view);
            },

            get type() {
                return getHandleType(view);
            },

            isAlive: () => isLiveView(view),

            parent: () => {
                if (!isLiveView(view) || !view.layoutParent) {
                    return undefined;
                }

                return getHandle(view.layoutParent);
            },

            children: () => {
                const children = getLayoutChildren(view);
                if (!isLiveView(view) || !children) {
                    return [];
                }

                return children.map((child) => getHandle(child));
            },
        };

        handlesByView.set(view, handle);
        viewsByHandle.set(handle, view);
        return handle;
    }

    /**
     * @param {import("./view.js").default} view
     * @returns {import("./view.js").default[] | undefined}
     */
    function getLayoutChildren(view) {
        const children = /** @type {{ children?: unknown }} */ (view).children;
        return Array.isArray(children)
            ? /** @type {import("./view.js").default[]} */ (children)
            : undefined;
    }

    /**
     * @param {ViewAddress} address
     * @returns {import("../types/embedApi.js").ViewHandle | undefined}
     */
    function resolve(address) {
        if (address === "root") {
            return getHandle(getRootView());
        } else if (isViewHandle(address)) {
            return viewsByHandle.has(address) && address.isAlive()
                ? address
                : undefined;
        } else if (isViewSelector(address)) {
            const view = resolveViewSelector(getRootView(), address);
            return view ? getHandle(view) : undefined;
        } else {
            throw new ViewMutationError(
                "invalidAddress",
                'View address must be a handle, selector, or "root".'
            );
        }
    }

    /**
     * @param {ViewAddress} address
     * @returns {import("../types/embedApi.js").ViewHandle}
     */
    function get(address) {
        const handle = resolve(address);
        if (handle) {
            return handle;
        }

        if (isViewHandle(address) && viewsByHandle.has(address)) {
            throw new ViewMutationError(
                "staleHandle",
                "Stale view handle no longer refers to a live view."
            );
        }

        throw new ViewMutationError(
            "unresolvedAddress",
            "View address did not resolve to a live view."
        );
    }

    /**
     * @template T
     * @param {() => T | Promise<T>} operation
     * @returns {Promise<T>}
     */
    function enqueue(operation) {
        if (transactionDepth > 0) {
            return Promise.resolve(operation());
        }

        const next = queue.then(operation, operation);
        queue = next.then(clearQueueValue, clearQueueValue);
        return next;
    }

    /**
     * @returns {void}
     */
    function clearQueueValue() {}

    /**
     * @returns {Promise<ViewHandle>}
     */
    function rejectInsert() {
        return Promise.reject(
            new ViewMutationError(
                "notImplemented",
                "View insertion is not implemented yet."
            )
        );
    }

    /**
     * @returns {Promise<void>}
     */
    function rejectRemove() {
        return Promise.reject(
            new ViewMutationError(
                "notImplemented",
                "View removal is not implemented yet."
            )
        );
    }

    /**
     * @returns {Promise<ViewHandle>}
     */
    function rejectMove() {
        return Promise.reject(
            new ViewMutationError(
                "notImplemented",
                "View reordering is not implemented yet."
            )
        );
    }

    /** @type {import("../types/embedApi.js").ViewMutationApi} */
    const api = {
        root: () => getHandle(getRootView()),

        resolve,

        get,

        insert: () => enqueue(rejectInsert),

        remove: () => enqueue(rejectRemove),

        move: () => enqueue(rejectMove),

        transaction: (/** @type {(views: typeof api) => any} */ callback) =>
            enqueue(async () => {
                transactionDepth++;
                try {
                    return await callback(api);
                } finally {
                    transactionDepth--;
                }
            }),
    };

    return api;
}

/**
 * @param {unknown} address
 * @returns {address is import("../types/embedApi.js").ViewHandle}
 */
function isViewHandle(address) {
    return (
        typeof address === "object" &&
        address !== null &&
        typeof (/** @type {any} */ (address).isAlive) === "function"
    );
}

/**
 * @param {unknown} address
 * @returns {address is import("../view/viewUtilTypes.d.ts").ViewSelector}
 */
function isViewSelector(address) {
    return (
        typeof address === "object" &&
        address !== null &&
        Array.isArray(/** @type {any} */ (address).scope) &&
        typeof (/** @type {any} */ (address).view) === "string"
    );
}
