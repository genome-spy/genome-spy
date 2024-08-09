import {
    activateExprRefProps,
    withoutExprRef,
} from "../../view/paramMediator.js";
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
        super(view);

        this.sequence = activateExprRefProps(
            view.paramMediator,
            params.sequence,
            () => this.loadSynchronously()
        );

        if (!("start" in this.sequence)) {
            throw new Error("'start' is missing from sequence parameters!");
        }
        if (!("stop" in this.sequence)) {
            throw new Error("'stop' is missing from sequence parameters!");
        }
    }

    get label() {
        return "sequenceSource";
    }

    loadSynchronously() {
        const as = withoutExprRef(this.sequence.as) ?? "data";
        const start = withoutExprRef(this.sequence.start) ?? 0;
        const step = withoutExprRef(this.sequence.step) ?? 1;
        const stop = withoutExprRef(this.sequence.stop);

        this.reset();
        this.beginBatch({ type: "file" });

        for (let x = start; x < stop; x += step) {
            this._propagate({ [as]: x });
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
