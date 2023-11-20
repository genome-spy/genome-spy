import DataSource from "./dataSource.js";

/**
 * @param {Partial<import("../../spec/data.js").Data>} data
 * @returns {data is import("../../spec/data.js").SequenceGenerator}
 */
export function isSequenceGenerator(data) {
    return "sequence" in data;
}

export default class SequenceSource extends DataSource {
    /**
     *
     * @param {import("../../spec/data.js").SequenceGenerator} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super();
        this.sequence = params.sequence;

        if (!("start" in this.sequence)) {
            throw new Error("'start' is missing from sequence parameters!");
        }
        if (!("stop" in this.sequence)) {
            throw new Error("'stop' is missing from sequence parameters!");
        }
    }

    loadSynchronously() {
        const as = this.sequence.as || "data";
        const step = this.sequence.step || 1;
        const stop = this.sequence.stop;

        this.reset();
        this.beginBatch({ type: "file" });

        for (let x = this.sequence.start; x < stop; x += step) {
            this._propagate({ [as]: x });
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
