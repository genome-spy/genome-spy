import ConcatView from "./concatView.js";
import GridView from "./gridView/gridView.js";
import LayerView from "./layerView.js";
import { isMultiscaleSpec } from "./multiscale.js";
import UnitView from "./unitView.js";
import { isImportSpec, isLayerSpec, isUnitSpec } from "./viewSpecGuards.js";
import {
    getImportScopeInfo,
    getViewScopeChain,
    getViewSelector,
    registerImportInstance,
    resolveViewSelector,
} from "./viewSelectors.js";

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
 * @typedef {{
 *   depth: number,
 *   queue: Promise<void>,
 *   failed: boolean,
 *   error: unknown | undefined,
 *   requestedLayoutReflow: boolean,
 *   restoreLayoutReflow: () => void
 * }} TransactionState
 */

/**
 * Creates the public view hierarchy API for a GenomeSpy instance.
 *
 * @param {{ viewRoot: import("./view.js").default }} genomeSpy
 * @returns {import("../types/embedApi.js").ViewApi}
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
    let queue = Promise.resolve();

    /** @type {TransactionState | undefined} */
    let activeTransaction;

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
     * @param {ViewAddress} address
     * @returns {import("./view.js").default}
     */
    function getView(address) {
        const handle = get(address);
        const view = viewsByHandle.get(handle);
        if (!view) {
            throw new ViewMutationError(
                "invalidAddress",
                "View handle is not owned by this GenomeSpy instance."
            );
        }

        return view;
    }

    /**
     * @param {ViewAddress} address
     * @returns {import("../types/embedApi.js").ViewLayoutBounds | undefined}
     */
    function getLayoutBounds(address) {
        const handle = resolve(address);
        if (!handle) {
            return undefined;
        }

        const view = viewsByHandle.get(handle);
        const coords = view?.coords;
        if (!coords) {
            return undefined;
        }

        return {
            x: coords.x,
            y: coords.y,
            width: coords.width,
            height: coords.height,
        };
    }

    /**
     * @param {() => void} listener
     * @returns {() => void}
     */
    function subscribeToLayout(listener) {
        const context = getRootView().context;
        const broadcastListener = () => listener();
        context.addBroadcastListener("layoutComputed", broadcastListener);

        return () =>
            context.removeBroadcastListener(
                "layoutComputed",
                broadcastListener
            );
    }

    /**
     * @template T
     * @param {() => T | Promise<T>} operation
     * @returns {Promise<T>}
     */
    function enqueue(operation) {
        if (activeTransaction) {
            return enqueueTransactionOperation(activeTransaction, operation);
        }

        return enqueueTopLevelOperation(operation);
    }

    /**
     * @template T
     * @param {() => T | Promise<T>} operation
     * @returns {Promise<T>}
     */
    function enqueueTopLevelOperation(operation) {
        const next = queue.then(operation, operation);
        queue = next.then(clearQueueValue, clearQueueValue);
        return next;
    }

    /**
     * @template T
     * @param {TransactionState} transaction
     * @param {() => T | Promise<T>} operation
     * @returns {Promise<T>}
     */
    function enqueueTransactionOperation(transaction, operation) {
        const next = transaction.queue.then(operation, operation);
        transaction.queue = next.then(clearQueueValue, (error) => {
            transaction.failed = true;
            transaction.error = error;
        });
        return next;
    }

    /**
     * @returns {void}
     */
    function clearQueueValue() {}

    /**
     * @returns {TransactionState}
     */
    function beginTransaction() {
        const transaction = activeTransaction;
        if (transaction) {
            transaction.depth++;
            return transaction;
        }

        const context = getRootView().context;
        const requestLayoutReflow = context.requestLayoutReflow;
        /** @type {TransactionState} */
        const topLevelTransaction = {
            depth: 1,
            queue: Promise.resolve(),
            failed: false,
            error: undefined,
            requestedLayoutReflow: false,
            restoreLayoutReflow: () => {
                context.requestLayoutReflow = requestLayoutReflow;
                if (topLevelTransaction.requestedLayoutReflow) {
                    requestLayoutReflow.call(context);
                }
            },
        };

        context.requestLayoutReflow = () => {
            topLevelTransaction.requestedLayoutReflow = true;
        };
        activeTransaction = topLevelTransaction;
        return topLevelTransaction;
    }

    /**
     * @param {TransactionState} transaction
     * @returns {void}
     */
    function endTransaction(transaction) {
        transaction.depth--;

        if (transaction.depth === 0) {
            transaction.restoreLayoutReflow();
            activeTransaction = undefined;
        }
    }

    /**
     * Mutations may enqueue more mutations from promise continuations. Keep
     * draining until the transaction queue stops changing.
     *
     * @param {TransactionState} transaction
     * @returns {Promise<void>}
     */
    async function waitForTransactionQueue(transaction) {
        let currentQueue;
        do {
            currentQueue = transaction.queue;
            await currentQueue;
        } while (transaction.queue !== currentQueue);
    }

    /**
     * @template T
     * @param {(views: import("../types/embedApi.js").ViewApi) => T | Promise<T>} callback
     * @returns {Promise<T>}
     */
    async function runTransaction(callback) {
        const transaction = beginTransaction();
        const previouslyFailed = transaction.failed;
        /** @type {T | undefined} */
        let result;
        /** @type {unknown} */
        let callbackError;
        let callbackFailed = false;

        try {
            result = await callback(api);
        } catch (error) {
            callbackError = error;
            callbackFailed = true;
        }

        await waitForTransactionQueue(transaction);

        try {
            if (callbackFailed) {
                throw callbackError;
            }

            if (transaction.failed && transaction.failed !== previouslyFailed) {
                throw transaction.error;
            }

            return /** @type {T} */ (result);
        } finally {
            endTransaction(transaction);
        }
    }

    /**
     * @param {ViewAddress} parentAddress
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} spec
     * @param {import("../types/embedApi.js").InsertViewOptions} [options]
     * @returns {Promise<ViewHandle>}
     */
    function insert(parentAddress, spec, options = {}) {
        return enqueue(async () => {
            const parentView = getView(parentAddress);
            const childCount = getMutableContainerChildCount(parentView);
            const index = getInsertIndex(options.index, childCount);
            const scopeName = getInsertScopeName(spec, options);

            if (scopeName !== undefined && typeof scopeName === "string") {
                ensureScopeNameIsAvailable(parentView, scopeName);
            }

            const childSpec = structuredClone(spec);
            const childView = await addChildToMutableContainer(
                parentView,
                childSpec,
                index
            );

            if (options.scope !== undefined) {
                registerImportInstance(childView, options.scope);
            }

            return getHandle(childView);
        });
    }

    /**
     * @param {import("./view.js").default} parentView
     * @returns {number}
     */
    function getMutableContainerChildCount(parentView) {
        if (
            !(parentView instanceof ConcatView) &&
            !(parentView instanceof LayerView)
        ) {
            throw new ViewMutationError(
                "unsupportedContainer",
                "Only concat and layer views support child insertion."
            );
        }

        const children = getLayoutChildren(parentView);
        if (!children) {
            throw new ViewMutationError(
                "unsupportedContainer",
                "Mutable container does not expose layout children."
            );
        }

        return children.length;
    }

    /**
     * @param {import("./view.js").default} parentView
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} childSpec
     * @param {number} index
     * @returns {Promise<import("./view.js").default>}
     */
    async function addChildToMutableContainer(parentView, childSpec, index) {
        if (parentView instanceof ConcatView) {
            return parentView.addChildSpec(childSpec, index);
        } else if (parentView instanceof LayerView) {
            if (!isLayerChildSpec(childSpec)) {
                throw new ViewMutationError(
                    "unsupportedChildSpec",
                    "Layer views accept only unit, layer, multiscale, or import specs as children."
                );
            }

            return parentView.addChildSpec(childSpec, index);
        }

        throw new ViewMutationError(
            "unsupportedContainer",
            "Only concat and layer views support child insertion."
        );
    }

    /**
     * @param {number | undefined} index
     * @param {number} childCount
     * @returns {number}
     */
    function getInsertIndex(index, childCount) {
        const insertIndex = index ?? childCount;

        if (!Number.isInteger(insertIndex)) {
            throw new ViewMutationError(
                "invalidIndex",
                "Insert index must be an integer."
            );
        }

        if (insertIndex < 0 || insertIndex > childCount) {
            throw new ViewMutationError(
                "invalidIndex",
                "Insert index must be between 0 and the current child count."
            );
        }

        return insertIndex;
    }

    /**
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} spec
     * @param {import("../types/embedApi.js").InsertViewOptions} options
     * @returns {string | null | undefined}
     */
    function getInsertScopeName(spec, options) {
        const importScopeName =
            isImportSpec(spec) && "name" in spec ? spec.name : undefined;

        if (
            options.scope !== undefined &&
            importScopeName !== undefined &&
            options.scope !== importScopeName
        ) {
            throw new ViewMutationError(
                "scopeMismatch",
                "Insert scope must match the import instance name."
            );
        }

        return options.scope ?? importScopeName;
    }

    /**
     * @param {import("./view.js").default} parentView
     * @param {string} scopeName
     */
    function ensureScopeNameIsAvailable(parentView, scopeName) {
        const parentScope = getViewScopeChain(parentView);
        const targetScope = parentScope.concat(scopeName);

        getRootView().visit((view) => {
            const info = getImportScopeInfo(view);
            if (
                info &&
                info.name === scopeName &&
                scopesEqual(getViewScopeChain(view), targetScope)
            ) {
                throw new ViewMutationError(
                    "duplicateScope",
                    'Scope "' + scopeName + '" already exists.'
                );
            }
        });
    }

    /**
     * @param {string[]} a
     * @param {string[]} b
     * @returns {boolean}
     */
    function scopesEqual(a, b) {
        if (a.length !== b.length) {
            return false;
        }

        return a.every((value, index) => value === b[index]);
    }

    /**
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} spec
     * @returns {spec is import("../spec/view.js").UnitSpec | import("../spec/view.js").LayerSpec | import("../spec/view.js").MultiscaleSpec | import("../spec/view.js").ImportSpec}
     */
    function isLayerChildSpec(spec) {
        if (isImportSpec(spec)) {
            return true;
        }

        const viewSpec = /** @type {import("../spec/view.js").ViewSpec} */ (
            spec
        );
        return (
            isUnitSpec(viewSpec) ||
            isLayerSpec(viewSpec) ||
            isMultiscaleSpec(viewSpec)
        );
    }

    /**
     * @param {ViewAddress} targetAddress
     * @returns {Promise<void>}
     */
    function remove(targetAddress) {
        return enqueue(async () => {
            const targetView = getView(targetAddress);
            if (targetView === getRootView() || !targetView.layoutParent) {
                throw new ViewMutationError(
                    "cannotRemoveRoot",
                    "Removing the root view is not supported."
                );
            }

            const parentView = targetView.layoutParent;
            const children = getLayoutChildren(parentView);
            if (!children) {
                throw new ViewMutationError(
                    "unsupportedContainer",
                    "Parent view does not expose layout children."
                );
            }

            const index = children.indexOf(targetView);
            if (index < 0) {
                throw new ViewMutationError(
                    "invalidHierarchy",
                    "Target view is not a child of its layout parent."
                );
            }

            await removeChildFromMutableContainer(parentView, index);
        });
    }

    /**
     * @param {import("./view.js").default} parentView
     * @param {number} index
     */
    async function removeChildFromMutableContainer(parentView, index) {
        if (parentView instanceof ConcatView) {
            await parentView.removeChildAt(index);
        } else if (parentView instanceof LayerView) {
            await parentView.removeChildAt(index);
        } else {
            throw new ViewMutationError(
                "unsupportedContainer",
                "Only concat and layer views support child removal."
            );
        }
    }

    /**
     * @param {ViewAddress} targetAddress
     * @param {import("../types/embedApi.js").MoveViewOptions} options
     * @returns {Promise<ViewHandle>}
     */
    function move(targetAddress, options) {
        return enqueue(async () => {
            const targetView = getView(targetAddress);
            if (targetView === getRootView() || !targetView.layoutParent) {
                throw new ViewMutationError(
                    "cannotMoveRoot",
                    "Moving the root view is not supported."
                );
            }

            const parentView = targetView.layoutParent;
            const children = getLayoutChildren(parentView);
            if (!children) {
                throw new ViewMutationError(
                    "unsupportedContainer",
                    "Parent view does not expose layout children."
                );
            }

            const fromIndex = children.indexOf(targetView);
            if (fromIndex < 0) {
                throw new ViewMutationError(
                    "invalidHierarchy",
                    "Target view is not a child of its layout parent."
                );
            }

            if (!options) {
                throw new ViewMutationError(
                    "invalidIndex",
                    "Move options with an index are required."
                );
            }

            const index = getMoveIndex(options.index, children.length - 1);
            await moveChildWithinMutableContainer(parentView, fromIndex, index);

            return getHandle(targetView);
        });
    }

    /**
     * @param {number | undefined} index
     * @param {number} remainingChildCount
     * @returns {number}
     */
    function getMoveIndex(index, remainingChildCount) {
        if (!Number.isInteger(index)) {
            throw new ViewMutationError(
                "invalidIndex",
                "Move index must be an integer."
            );
        }

        if (index < 0 || index > remainingChildCount) {
            throw new ViewMutationError(
                "invalidIndex",
                "Move index must be between 0 and the remaining child count."
            );
        }

        return index;
    }

    /**
     * @param {import("./view.js").default} parentView
     * @param {number} fromIndex
     * @param {number} index
     */
    async function moveChildWithinMutableContainer(
        parentView,
        fromIndex,
        index
    ) {
        if (parentView instanceof ConcatView) {
            await parentView.moveChildAt(fromIndex, index);
        } else if (parentView instanceof LayerView) {
            parentView.moveChildAt(fromIndex, index);
        } else {
            throw new ViewMutationError(
                "unsupportedContainer",
                "Only concat and layer views support child reordering."
            );
        }
    }

    /** @type {import("../types/embedApi.js").ViewApi} */
    const api = {
        root: () => getHandle(getRootView()),

        resolve,

        get,

        getLayoutBounds,

        subscribeToLayout,

        insert,

        remove,

        move,

        transaction: (callback) =>
            activeTransaction
                ? runTransaction(callback)
                : enqueueTopLevelOperation(() => runTransaction(callback)),
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
