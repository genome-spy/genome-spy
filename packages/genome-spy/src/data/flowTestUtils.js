import Collector from "./collector";
import FlowNode from "./flowNode";

/**
 *
 * @param {import("./flowNode").default} flowNode
 * @param {any[]} data
 */
export function processData(flowNode, data) {
    const collector = new Collector();
    flowNode.addChild(collector);

    for (const d of data) {
        flowNode.handle(d);
    }
    flowNode.complete();

    flowNode.removeChild(collector);

    return collector.getData();
}

/**
 * For testing
 */
export class SynchronousSource extends FlowNode {
    /**
     *
     * @param {any[]} data
     */
    constructor(data) {
        super();
        this.data = data;
    }

    dispatch() {
        for (const d of this.data) {
            this._propagate(d);
        }

        this.complete();
    }
}

/**
 * For testing
 */
export class SynchronousSequenceSource extends SynchronousSource {
    /**
     *
     * @param {number} n number of elements
     */
    constructor(n) {
        n = n || 10;

        const data = [];
        for (let i = 0; i < n; i++) {
            data.push({ data: i });
        }

        super(data);
    }
}
