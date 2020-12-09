/**
 * @template H host. For example a GenomeSpy view.
 */
export default class FlowNode {
    constructor() {
        /** @type {FlowNode<H>[]} */
        this.children = [];

        /** @type {FlowNode<H>} */
        this.parent = undefined;

        this.completed = false;

        /** @type {H} */
        this.host = undefined;
    }

    /**
     * Resets the node to its initial state, i.e., preparing it for a new batch
     * of data.
     */
    reset() {
        this.completed = false;

        for (const child of this.children) {
            child.reset();
        }
    }

    /**
     * Dynamically updates the propagator method to allow the JavaScript engine
     * to employ optimizations such as inlining.
     */
    _updatePropagator() {
        /** @type {function(any):void} */
        let propagate;

        if (this.children.length == 0) {
            propagate = datum => {
                // nop. This case should have been optimized away from the flow structure.
            };
        } else if (this.children.length == 1) {
            const child = this.children[0];
            propagate = datum => {
                child.handle(datum);
            };
        } else {
            // TODO: Consider unrolling
            propagate = datum => {
                for (const child of this.children) {
                    child.handle(datum);
                }
            };
        }
        this._propagate = propagate;
    }

    /**
     *
     * @param {FlowNode<H>} child
     */
    addChild(child) {
        this.children.push(child);
        child.parent = this;
        this._updatePropagator();
        return this;
    }

    /**
     *
     * @param {FlowNode<H>} child
     */
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            this._updatePropagator();
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
        // Implementation is set dynamically in add/removeChild
    }
}
