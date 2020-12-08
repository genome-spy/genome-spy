import FlowNode from "../flowNode";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").SequenceGenerator}
 */
export function isSequenceGenerator(data) {
    return "sequence" in data;
}

/**
 * @template H
 * @extends {FlowNode<H>}
 */
export default class SequenceSource extends FlowNode {
    /**
     *
     * @param {import("../../spec/data").SequenceGenerator} params
     */
    constructor(params) {
        super();
        this.sequence = params.sequence;

        if (!("start" in this.sequence)) {
            throw new Error("'start' is missing from sequence parameters!");
        }
        if (!("stop" in this.sequence)) {
            throw new Error("'stop' is missing from sequence parameters!");
        }
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data!");
    }

    loadSynchronously() {
        const as = this.sequence.as || "data";
        const step = this.sequence.step || 1;
        const stop = this.sequence.stop;

        this.reset();

        for (let x = this.sequence.start; x < stop; x += step) {
            this._propagate({ [as]: x });
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
