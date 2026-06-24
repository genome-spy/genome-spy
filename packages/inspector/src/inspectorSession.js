/**
 * Browser-side state and runtime bridge for the inspector UI.
 */
export default class InspectorSession extends EventTarget {
    /** @type {any} */
    #app;

    /** @type {boolean} */
    #includeChrome = false;

    /** @type {WeakMap<object, string>} */
    #ids = new WeakMap();

    /** @type {Map<string, object>} */
    #objectsById = new Map();

    /** @type {Record<string, number>} */
    #idCounters = {};

    /** @type {Promise<typeof import("@genome-spy/core/debug/viewDebugSnapshot.js")> | undefined} */
    #viewDebugModulePromise;

    /** @type {Promise<typeof import("@genome-spy/core/debug/resolutionDebugSnapshot.js")> | undefined} */
    #resolutionDebugModulePromise;

    /** @type {Promise<typeof import("@genome-spy/core/debug/dataflowDebugSnapshot.js")> | undefined} */
    #dataflowDebugModulePromise;

    /** @type {(() => void)[]} */
    #disposers = [];

    /** @type {boolean} */
    #disposed = false;

    /** @type {import("@genome-spy/core/debug/viewDebugSnapshot.js").ViewDebugSnapshot & { resolutions: import("@genome-spy/core/debug/resolutionDebugSnapshot.js").ResolutionDebugSnapshot, dataflow: import("@genome-spy/core/debug/dataflowDebugSnapshot.js").DataflowDebugSnapshot }} */
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
    };

    /**
     * @param {any} app
     */
    constructor(app) {
        super();
        this.#app = app;
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

        const genomeSpy = this.#app.genomeSpy;
        const root = genomeSpy.viewRoot;
        const [viewDebugModule, resolutionDebugModule, dataflowDebugModule] =
            await Promise.all([
                this.#getViewDebugModule(),
                this.#getResolutionDebugModule(),
                this.#getDataflowDebugModule(),
            ]);
        this.#objectsById = new Map();
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
                }
            ),
        };
        this.#ensureRuntimeSubscriptions();
        this.dispatchEvent(new Event("snapshot"));
    }

    /**
     * @param {string | undefined} viewId
     */
    highlightView(viewId) {
        const root = this.#app.genomeSpy.viewRoot;
        if (!root) {
            return;
        }

        const view = viewId ? this.#objectsById.get(viewId) : null;
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

    #ensureRuntimeSubscriptions() {
        if (this.#disposers.length > 0) {
            return;
        }

        const root = this.#app.genomeSpy.viewRoot;
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

    /**
     * @param {object} object
     * @returns {string}
     */
    #getDebugId(object) {
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
 * @param {object} object
 * @returns {string}
 */
function getDebugIdPrefix(object) {
    if ("spec" in object) {
        return "v";
    }

    if ("channel" in object) {
        return "r";
    }

    return "o";
}
