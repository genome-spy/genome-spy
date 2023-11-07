import { read } from "vega-loader";
import { getFormat, makeWrapper } from "./dataUtils.js";
import DataSource from "./dataSource.js";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").InlineData}
 */
export function isInlineData(data) {
    return "values" in data;
}

export default class InlineSource extends DataSource {
    /**
     * @param {import("../../spec/data").InlineData} params
     * @param {import("../../view/view").default} view
     */
    constructor(params, view) {
        super();

        this.params = params;

        if (typeof params.values == "string" && !params?.format?.type) {
            throw new Error(
                "Data format type (csv, dsv, ...) must be specified if a string is provided!"
            );
        }
    }

    loadSynchronously() {
        const values = this.params.values;

        let data = [];

        /** @type {(x: any) => import("../flowNode").Datum} */
        let wrap = (x) => x;

        if (Array.isArray(values)) {
            if (values.length > 0) {
                data = values;
                // TODO: Should check the whole array and abort if types are heterogeneous
                wrap = makeWrapper(values[0]);
            }
        } else if (typeof values == "object") {
            data = [values];
        } else if (typeof values == "string") {
            // It's a string that needs to be parsed
            data = read(values, getFormat(this.params));
        } else {
            throw new Error(
                '"values" in data configuration is not an array, object, or a string!'
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
