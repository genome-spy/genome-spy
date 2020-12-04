export default class FlowNode {
    constructor() {
        /** @type {FlowNode[]} */
        this.children = [];

        /** @type {FlowNode} */
        this.parent = undefined;

        this.completed = false;
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

    /**
     *
     * @param {FlowNode} child
     */
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
        } else {
            throw new Error("Trying to remove an unknown child node!");
        }
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
        this.completed = true;

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
