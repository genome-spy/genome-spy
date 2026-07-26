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
        this.#disposed = true;
    }
}

/**
 * Lexical named-dataset scope owned by a view.
 */
export class NamedDataScope {
    /** @type {import("../view/view.js").default} */
    view;

    /** @type {Map<string, NamedDataBinding>} */
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
     * @returns {NamedDataBinding | undefined}
     */
    findDeclaredBinding(name) {
        const local = this.#localBindings.get(name);
        if (local) {
            return local;
        }
        return this.view.dataParent?.namedDataScope.findDeclaredBinding(name);
    }

    /**
     * Resolves a dataset declaration through the data-parent hierarchy.
     *
     * @param {string} name
     * @returns {NamedDataBinding}
     */
    resolve(name) {
        const local = this.#localBindings.get(name);
        if (local) {
            return local;
        }

        const parentScope = this.view.dataParent?.namedDataScope;
        if (parentScope) {
            return parentScope.resolve(name);
        }

        let legacy = this.#legacyBindings.get(name);
        if (!legacy) {
            legacy = new NamedDataBinding(name, undefined, () =>
                this.view.context.getNamedDataFromProvider(name)
            );
            this.#legacyBindings.set(name, legacy);
        }
        return legacy;
    }

    dispose() {
        for (const binding of this.#localBindings.values()) {
            binding.dispose();
        }
        this.#localBindings.clear();

        for (const binding of this.#legacyBindings.values()) {
            binding.dispose();
        }
        this.#legacyBindings.clear();
    }
}
