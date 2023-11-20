import FlowNode from "../flowNode.js";

export default class DataSource extends FlowNode {
    /**
     * Returns a string that identifies a data source. Data sources with the
     * same identifier can be merged.
     *
     * @return {string}
     */
    get identifier() {
        return undefined;
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data!");
    }

    async load() {
        // override
    }
}
