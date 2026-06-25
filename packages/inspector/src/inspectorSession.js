import { getViewIdentityRegistry } from "@genome-spy/core/view/viewIdentityRegistry.js";

/**
 * Browser-side state and runtime bridge for the inspector UI.
 *
 * @typedef {object} InspectorHost
 * @prop {() => any | undefined} getRootView
 * @prop {(view: object | null) => void} [highlightView]
 */
export default class InspectorSession extends EventTarget {
    /** @type {InspectorHost} */
    #host;

    /** @type {boolean} */
    #includeChrome = false;

    /** @type {WeakMap<object, string>} */
    #ids = new WeakMap();

    /** @type {Map<string, object>} */
    #objectsById = new Map();

    /** @type {Record<string, number>} */
    #idCounters = {};

    /** @type {WeakSet<object>} */
    #views = new WeakSet();

    /** @type {Promise<typeof import("@genome-spy/core/debug/viewDebugSnapshot.js")> | undefined} */
    #viewDebugModulePromise;

    /** @type {Promise<typeof import("@genome-spy/core/debug/resolutionDebugSnapshot.js")> | undefined} */
    #resolutionDebugModulePromise;

    /** @type {Promise<typeof import("@genome-spy/core/debug/dataflowDebugSnapshot.js")> | undefined} */
    #dataflowDebugModulePromise;

    /** @type {Promise<typeof import("@genome-spy/core/debug/paramDebugSnapshot.js")> | undefined} */
    #paramDebugModulePromise;

    /** @type {Promise<typeof import("@genome-spy/core/debug/markDebugSnapshot.js")> | undefined} */
    #markDebugModulePromise;

    /** @type {(() => void)[]} */
    #disposers = [];

    /** @type {boolean} */
    #disposed = false;

    /** @type {import("@genome-spy/core/debug/viewDebugSnapshot.js").ViewDebugSnapshot & { resolutions: import("@genome-spy/core/debug/resolutionDebugSnapshot.js").ResolutionDebugSnapshot, dataflow: import("@genome-spy/core/debug/dataflowDebugSnapshot.js").DataflowDebugSnapshot, params: import("@genome-spy/core/debug/paramDebugSnapshot.js").ParamDebugSnapshot, marks: import("@genome-spy/core/debug/markDebugSnapshot.js").MarkDebugSnapshot }} */
    snapshot = {
        rootId: undefined,
        nodes: [],
        resolutions: {
            scales: [],
            axes: [],
            legends: [],
        },
        dataflow: {
            sourceIds: [],
            nodes: [],
            collectorCount: 0,
        },
        params: {
            scopes: [],
        },
        marks: {
            marks: [],
        },
    };

    /**
     * @param {InspectorHost} host
     */
    constructor(host) {
        super();
        this.#host = host;
    }

    get includeChrome() {
        return this.#includeChrome;
    }

    /**
     * @param {boolean} includeChrome
     */
    async setIncludeChrome(includeChrome) {
        if (this.#includeChrome === includeChrome) {
            return;
        }

        this.#includeChrome = includeChrome;
        await this.refresh();
    }

    async refresh() {
        if (this.#disposed) {
            return;
        }

        const root = this.#getRoot();
        const [
            viewDebugModule,
            resolutionDebugModule,
            dataflowDebugModule,
            paramDebugModule,
            markDebugModule,
        ] = await Promise.all([
            this.#getViewDebugModule(),
            this.#getResolutionDebugModule(),
            this.#getDataflowDebugModule(),
            this.#getParamDebugModule(),
            this.#getMarkDebugModule(),
        ]);
        this.#objectsById = new Map();
        this.#views = collectViews(root);
        const viewSnapshot = viewDebugModule.createViewDebugSnapshot(root, {
            includeChrome: this.#includeChrome,
            getDebugId: (object) => this.#getDebugId(object),
        });
        this.snapshot = {
            ...viewSnapshot,
            resolutions: resolutionDebugModule.createResolutionDebugSnapshot(
                root,
                {
                    getDebugId: (object) => this.#getDebugId(object),
                }
            ),
            dataflow: dataflowDebugModule.createDataflowDebugSnapshot(
                root?.context.dataFlow,
                {
                    getDebugId: (object) => this.#getDebugId(object),
                    rootView: root,
                }
            ),
            params: paramDebugModule.createParamDebugSnapshot(root, {
                getDebugId: (object) => this.#getDebugId(object),
            }),
            marks: markDebugModule.createMarkDebugSnapshot(root, {
                getDebugId: (object) => this.#getDebugId(object),
            }),
        };
        this.#ensureRuntimeSubscriptions();
        this.dispatchEvent(new Event("snapshot"));
    }

    /**
     * @param {string | undefined} viewId
     */
    highlightView(viewId) {
        const view = viewId ? this.#objectsById.get(viewId) : null;
        if (this.#host.highlightView) {
            this.#host.highlightView(view ?? null);
            return;
        }

        const root = this.#getRoot();
        if (!root) {
            return;
        }

        root.context.highlightView(view ?? null);
    }

    dispose() {
        this.#disposed = true;
        for (const disposer of this.#disposers.splice(0)) {
            disposer();
        }
        this.highlightView(undefined);
    }

    /**
     * @returns {Promise<typeof import("@genome-spy/core/debug/viewDebugSnapshot.js")>}
     */
    #getViewDebugModule() {
        this.#viewDebugModulePromise ??=
            import("@genome-spy/core/debug/viewDebugSnapshot.js");
        return this.#viewDebugModulePromise;
    }

    /**
     * @returns {Promise<typeof import("@genome-spy/core/debug/resolutionDebugSnapshot.js")>}
     */
    #getResolutionDebugModule() {
        this.#resolutionDebugModulePromise ??=
            import("@genome-spy/core/debug/resolutionDebugSnapshot.js");
        return this.#resolutionDebugModulePromise;
    }

    /**
     * @returns {Promise<typeof import("@genome-spy/core/debug/dataflowDebugSnapshot.js")>}
     */
    #getDataflowDebugModule() {
        this.#dataflowDebugModulePromise ??=
            import("@genome-spy/core/debug/dataflowDebugSnapshot.js");
        return this.#dataflowDebugModulePromise;
    }

    /**
     * @returns {Promise<typeof import("@genome-spy/core/debug/paramDebugSnapshot.js")>}
     */
    #getParamDebugModule() {
        this.#paramDebugModulePromise ??=
            import("@genome-spy/core/debug/paramDebugSnapshot.js");
        return this.#paramDebugModulePromise;
    }

    /**
     * @returns {Promise<typeof import("@genome-spy/core/debug/markDebugSnapshot.js")>}
     */
    #getMarkDebugModule() {
        this.#markDebugModulePromise ??=
            import("@genome-spy/core/debug/markDebugSnapshot.js");
        return this.#markDebugModulePromise;
    }

    #ensureRuntimeSubscriptions() {
        if (this.#disposers.length > 0) {
            return;
        }

        const root = this.#getRoot();
        if (!root) {
            return;
        }

        const refresh = () => {
            void this.refresh();
        };

        for (const type of /** @type {const} */ ([
            "layoutComputed",
            "subtreeDataReady",
            "dataFlowBuilt",
        ])) {
            root.context.addBroadcastListener(type, refresh);
            this.#disposers.push(() =>
                root.context.removeBroadcastListener(type, refresh)
            );
        }
    }

    #getRoot() {
        return this.#host.getRootView();
    }

    /**
     * @param {object} object
     * @returns {string}
     */
    #getDebugId(object) {
        if (this.#views.has(object)) {
            const root = this.#getRoot();
            const id = getViewIdentityRegistry(root).getId(
                /** @type {any} */ (object)
            );
            this.#objectsById.set(id, object);
            return id;
        }

        const existing = this.#ids.get(object);
        if (existing) {
            this.#objectsById.set(existing, object);
            return existing;
        }

        const prefix = getDebugIdPrefix(object);
        const next = (this.#idCounters[prefix] ?? 0) + 1;
        this.#idCounters[prefix] = next;
        const id = prefix + String(next);
        this.#ids.set(object, id);
        this.#objectsById.set(id, object);
        return id;
    }
}

/**
 * @param {any | undefined} root
 * @returns {WeakSet<object>}
 */
function collectViews(root) {
    const views = new WeakSet();
    /**
     * @param {object} view
     */
    const addView = (view) => {
        views.add(view);
    };
    root?.visit?.(addView);
    return views;
}

/**
 * @param {object} object
 * @returns {string}
 */
function getDebugIdPrefix(object) {
    if ("channel" in object) {
        return "r";
    }

    return "o";
}
