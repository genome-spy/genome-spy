import FlowNode from "./flowNode";

export default class SequenceSource extends FlowNode {
    /**
     *
     * @param {import("../../spec/data").SequenceParams} params
     */
    constructor(params) {
        super();
        if (!("start" in params)) {
            throw new Error("'start' is missing from sequence parameters!");
        }
        if (!("stop" in params)) {
            throw new Error("'stop' is missing from sequence parameters!");
        }

        this.params = params;
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data");
    }

    complete() {
        const as = this.params.as || "data";
        const step = this.params.step || 1;
        const stop = this.params.stop;

        for (let x = this.params.start; x < stop; x += step) {
            this._propagate({ [as]: x });
        }
    }
}
