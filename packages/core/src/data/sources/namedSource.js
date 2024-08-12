import DataSource from "./dataSource.js";
import { makeWrapper } from "./dataUtils.js";

/**
 * @param {Partial<import("../../spec/data.js").Data>} data
 * @returns {data is import("../../spec/data.js").NamedData}
 */
export function isNamedData(data) {
    return "name" in data;
}

export default class NamedSource extends DataSource {
    /**
     * Data that has been provided explicitly using the updateDynamicData method
     * @type {any[]}
     */
    #explicitData;

    /**
     * @param {import("../../spec/data.js").NamedData} params
     * @param {import("../../view/view.js").default} view
     * @param {function(string):any[]} provider Function that retrieves a dataset using a name
     */
    constructor(params, view, provider) {
        super(view);

        this.provider = provider;
        this.params = params;
    }

    /**
     * @return {string}
     */
    get identifier() {
        return this.params.name;
    }

    get label() {
        return "namedSource";
    }

    /**
     * Update the named data. If data is omitted, a data provider is used instead.
     *
     * @param {import("../flowNode.js").Datum[]} [data]
     */
    updateDynamicData(data) {
        // TODO: Throw is data is undefined and the provider is unable to provide any data
        this.#explicitData = data;
        this.loadSynchronously();
    }

    loadSynchronously() {
        const data =
            this.#explicitData ?? this.provider(this.params.name) ?? [];

        /** @type {(x: any) => import("../flowNode.js").Datum} */
        let wrap = (x) => x;

        if (Array.isArray(data)) {
            if (data.length > 0) {
                // TODO: Should check the whole array and abort if types are heterogeneous
                wrap = makeWrapper(data[0]);
            }
        } else {
            throw new Error(
                `Named data "${this.params.name}" is not an array!`
            );
        }

        this.reset();
        this.beginBatch({ type: "file" });

        for (const d of data) {
            this._propagate(wrap(d));
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
