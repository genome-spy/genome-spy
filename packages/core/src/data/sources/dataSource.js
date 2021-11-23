import FlowNode from "../flowNode";

export default class DataSource extends FlowNode {
    /**
     * @return {string}
     */
    get identifier() {
        return undefined;
    }

    /**
     *
     * @param {import("../flowNode").Datum} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data!");
    }

    async load() {
        // override
    }
}
