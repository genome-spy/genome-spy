import DataSource from "./dataSource";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").NamedData}
 */
export function isNamedData(data) {
    return "name" in data;
}

export default class NamedSource extends DataSource {
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
        const data = this.getNamedData(this.params.name);
        if (data) {
            return data;
        } else {
            throw new Error("Cannot find named data: " + this.params.name);
        }
    }

    loadSynchronously() {
        const data = this._getValues();

        /**
         * @param {any} x
         */
        let wrap = (x) => x;

        if (Array.isArray(data)) {
            if (data.length > 0) {
                // TODO: Should check the whole array and abort if types are heterogeneous
                if (typeof data[0] != "object") {
                    // Wrap scalars to objects
                    wrap = (d) => ({ data: d });
                }
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
