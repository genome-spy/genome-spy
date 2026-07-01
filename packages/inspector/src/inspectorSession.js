/**
 * Browser-side state and runtime bridge for the inspector UI.
 *
 * @typedef {object} InspectorHost
 * @prop {() => any | undefined} getViewRoot
 * @prop {() => Promise<InspectorDebugModules>} getModules
 *
 * @typedef {typeof import("@genome-spy/core/debug/index.js")} InspectorDebugModules
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

    /** @type {Promise<InspectorDebugModules> | undefined} */
    #debugModulesPromise;

    /** @type {InspectorDebugModules | undefined} */
    #debugModules;

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
        const debugModules = await this.#getDebugModules();
        this.#debugModules = debugModules;
        this.#objectsById = new Map();
        this.#views = collectViews(root);
        const viewSnapshot = debugModules.createViewDebugSnapshot(root, {
            includeChrome: this.#includeChrome,
            getDebugId: (object) => this.#getDebugId(object),
        });
        this.snapshot = {
            ...viewSnapshot,
            resolutions: debugModules.createResolutionDebugSnapshot(root, {
                getDebugId: (object) => this.#getDebugId(object),
            }),
            dataflow: debugModules.createDataflowDebugSnapshot(
                root?.context.dataFlow,
                {
                    getDebugId: (object) => this.#getDebugId(object),
                    rootView: root,
                }
            ),
            params: debugModules.createParamDebugSnapshot(root, {
                getDebugId: (object) => this.#getDebugId(object),
            }),
            marks: debugModules.createMarkDebugSnapshot(root, {
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
     * @returns {Promise<InspectorDebugModules>}
     */
    #getDebugModules() {
        this.#debugModulesPromise ??= this.#host.getModules();
        return this.#debugModulesPromise;
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
        return this.#host.getViewRoot();
    }

    /**
     * @param {object} object
     * @returns {string}
     */
    #getDebugId(object) {
        if (this.#views.has(object)) {
            const root = this.#getRoot();
            const debugModules = this.#debugModules;
            if (!debugModules) {
                throw new Error(
                    "Inspector debug modules have not been loaded."
                );
            }

            const id = debugModules
                .getViewIdentityRegistry(root)
                .getId(/** @type {any} */ (object));
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
