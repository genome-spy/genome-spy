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
     * @param {import("../../spec/data.js").NamedData} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);

        this.params = params;
        this.binding = view.namedDataScope.resolve(params.name);
    }

    /**
     * @return {string}
     */
    get identifier() {
        return this.params.name;
    }

    get shareKey() {
        return this.binding;
    }

    get label() {
        return "namedSource";
    }

    /**
     * Updates the dataset binding and reloads all of its consumers. Omitting
     * data resets the binding to its configured or provider-backed default.
     *
     * @param {import("../flowNode.js").Datum[]} [data]
     */
    updateDynamicData(data) {
        this.view.context.dataFlow.updateNamedDataBinding(this.binding, data);
    }

    loadSynchronously() {
        const data = this.binding.getData();

        /** @type {(x: any) => import("../flowNode.js").Datum} */
        let wrap = (x) => x;

        if (Array.isArray(data)) {
            if (data.length > 0) {
                // TODO: Should check the whole array and abort if types are heterogeneous
                wrap = makeWrapper(data[0]);
            }
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
