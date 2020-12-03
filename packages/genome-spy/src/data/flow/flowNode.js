export default class FlowNode {
    constructor() {
        /** @type {FlowNode[]} */
        this.children = [];

        /** @type {FlowNode} */
        this.parent = undefined;
    }

    /**
     *
     * @param {FlowNode} child
     */
    addChild(child) {
        this.children.push(child);
        child.parent = this;
        return this;
    }

    isBranching() {
        return this.children.length > 1;
    }

    isTerminal() {
        return this.children.length == 0;
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        //
    }

    complete() {
        for (const child of this.children) {
            child.complete();
        }
    }

    /**
     *
     * @param {any} datum
     */
    _propagate(datum) {
        for (const child of this.children) {
            child.handle(datum);
        }
    }
}
