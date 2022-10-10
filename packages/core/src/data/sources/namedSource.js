import DataSource from "./dataSource";
import { makeWrapper } from "./dataUtils";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").NamedData}
 */
export function isNamedData(data) {
    return "name" in data;
}

export default class NamedSource extends DataSource {
    /** @type {import("../flowNode").Datum[]} */
    #dynamicData;

    /**
     * @param {import("../../spec/data").NamedData} params
     * @param {function(string):any[]} getNamedData
     */
    constructor(params, getNamedData) {
        super();

        this.getNamedData = getNamedData;
        this.params = params;
    }

    /**
     * @return {string}
     */
    get identifier() {
        return this.params.name;
    }

    _getValues() {
        if (this.#dynamicData) {
            return this.#dynamicData;
        }

        const data = this.getNamedData(this.params.name);
        if (data) {
            return data;
        } else {
            //throw new Error("Cannot find named data: " + this.params.name);
            return [];
        }
    }

    /**
     * @param {import("../flowNode").Datum[]} data
     */
    updateDynamicData(data) {
        // TODO: Check that it's an array

        // This is quite ugly now.
        // TODO: Figure out how to handle the two approaches:
        // (1) Update by looking up a named source
        // (2) Update through the named data provider
        this.#dynamicData = data;
        this.loadSynchronously();
    }

    loadSynchronously() {
        const data = this._getValues();

        /** @type {(x: any) => import("../flowNode").Datum} */
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
