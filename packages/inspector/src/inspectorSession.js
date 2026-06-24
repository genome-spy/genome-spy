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

    /** @type {(() => void)[]} */
    #disposers = [];

    /** @type {boolean} */
    #disposed = false;

    /** @type {import("@genome-spy/core/debug/viewDebugSnapshot.js").ViewDebugSnapshot} */
    snapshot = {
        rootId: undefined,
        nodes: [],
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
        const debugModule = await this.#getViewDebugModule();
        this.#objectsById = new Map();
        this.snapshot = debugModule.createViewDebugSnapshot(root, {
            includeChrome: this.#includeChrome,
            getDebugId: (object) => this.#getDebugId(object),
        });
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
