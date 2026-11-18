import DerivedCollector from "./derivedCollector.js";
import { annotateSpecError } from "../utils/specError.js";

/** @typedef {NamedDataBinding | DerivedCollector} NamedDatasetBinding */

/**
 * A named dataset declaration or a compatibility binding for an undeclared
 * embed-wide name.
 */
export class NamedDataBinding {
    /** @type {string} */
    name;

    /** @type {import("../view/view.js").default | undefined} */
    owner;

    /** @type {() => any[] | undefined} */
    getDefaultData;

    /** @type {any[] | undefined} */
    #override;

    #hasOverride = false;
    #updateGeneration = 0;
    #disposed = false;

    /**
     * @param {string} name
     * @param {import("../view/view.js").default | undefined} owner
     * @param {() => any[] | undefined} getDefaultData
     */
    constructor(name, owner, getDefaultData) {
        this.name = name;
        this.owner = owner;
        this.getDefaultData = getDefaultData;
    }

    get disposed() {
        return this.#disposed;
    }

    /**
     * Claims the next runtime update generation.
     */
    beginUpdate() {
        if (this.#disposed) {
            throw new Error(`Named dataset "${this.name}" has been disposed.`);
        }
        return ++this.#updateGeneration;
    }

    /**
     * @param {number} generation
     */
    isCurrentUpdate(generation) {
        return !this.#disposed && generation === this.#updateGeneration;
    }

    /**
     * Returns the runtime override or the declared/provider-backed default.
     *
     * @returns {any[]}
     */
    getData() {
        if (this.#disposed) {
            throw new Error(`Named dataset "${this.name}" has been disposed.`);
        }

        const data = this.#hasOverride ? this.#override : this.getDefaultData();

        if (data === undefined) {
            return [];
        } else if (!Array.isArray(data)) {
            throw new Error(`Named data "${this.name}" is not an array!`);
        }

        return data;
    }

    /**
     * @param {any[]} data
     */
    setData(data) {
        if (!Array.isArray(data)) {
            throw new Error(`Named data "${this.name}" is not an array!`);
        }
        this.#override = data;
        this.#hasOverride = true;
    }

    resetData() {
        this.#override = undefined;
        this.#hasOverride = false;
    }

    dispose() {
        this.#override = undefined;
        this.#hasOverride = false;
        this.#updateGeneration++;
        this.#disposed = true;
    }
}

/** Lexical named-dataset scope owned by a view. */
export class NamedDataScope {
    /** @type {import("../view/view.js").default} */
    view;

    /** @type {Map<string, NamedDatasetBinding>} */
    #localBindings = new Map();

    /** @type {Map<string, NamedDataBinding>} */
    #legacyBindings = new Map();

    /**
     * @param {import("../view/view.js").default} view
     */
    constructor(view) {
        this.view = view;

        for (const [name, data] of Object.entries(view.spec.datasets ?? {})) {
            this.#localBindings.set(
                name,
                new NamedDataBinding(name, view, () => data)
            );
        }
    }

    /** @param {import("../spec/transform.js").PublishParams} params */
    declareDerived(params) {
        const view = this.view;
        const name = params.dataset;
        const error = (/** @type {string} */ message) =>
            annotateSpecError(
                new Error(message),
                view.paramRuntime.getSpecLocation(params, ["dataset"])
            );
        if (typeof name !== "string" || !name.trim()) {
            throw error("publish.dataset must be a non-empty string.");
        }
        if (this.#localBindings.has(name)) {
            throw error(`Duplicate named dataset "${name}" in this view.`);
        }
        this.#localBindings.set(name, new DerivedCollector(params, view));
    }

    /** @param {string} name */
    getDerivedCollector(name) {
        // The factory declared this binding before flow construction.
        return /** @type {DerivedCollector} */ (this.getLocalBinding(name));
    }

    /**
     * Returns a dataset declared by this exact view.
     *
     * @param {string} name
     */
    getLocalBinding(name) {
        return this.#localBindings.get(name);
    }

    /**
     * Returns the nearest declared binding without creating a compatibility
     * binding for an undeclared name.
     *
     * @param {string} name
     * @returns {NamedDatasetBinding | undefined}
     */
    findDeclaredBinding(name) {
        return this.#findScope(name).getLocalBinding(name);
    }

    /**
     * Returns the nearest declaration's scope, or the lexical root for legacy names.
     * @param {string} name
     */
    #findScope(name) {
        /** @type {NamedDataScope} */
        let scope = this;
        while (!scope.#localBindings.has(name) && scope.view.dataParent) {
            scope = scope.view.dataParent.namedDataScope;
        }
        return scope;
    }

    /**
     * Resolves a dataset declaration through the data-parent hierarchy.
     *
     * @param {string} name
     * @returns {NamedDatasetBinding}
     */
    resolve(name) {
        const scope = this.#findScope(name);
        const local = scope.getLocalBinding(name);
        if (local) return local;

        // TODO: Remove this embed-wide fallback together with the deprecated
        // namedDataProvider and updateNamedData APIs. Unresolved names can then
        // fail fast, leaving one explicit lexical ownership model and simpler
        // source sharing, update routing, and disposal.
        let legacy = scope.#legacyBindings.get(name);
        if (!legacy) {
            legacy = new NamedDataBinding(name, undefined, () =>
                scope.view.context.getNamedDataFromProvider(name)
            );
            scope.#legacyBindings.set(name, legacy);
        }
        return legacy;
    }

    dispose() {
        for (const binding of this.#localBindings.values()) {
            if (binding instanceof NamedDataBinding) binding.dispose();
        }
        this.#localBindings.clear();

        for (const binding of this.#legacyBindings.values()) {
            binding.dispose();
        }
        this.#legacyBindings.clear();
    }
}
