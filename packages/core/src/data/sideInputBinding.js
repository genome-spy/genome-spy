/**
 * Publication-level consumption of declared collectors. Row algorithms and
 * coverage/request policy stay in the consumer; no tuple changes are tracked.
 */
export default class SideInputBinding {
    /** @type {import("./flowNode.js").default} */
    #node;

    /** @type {{collector: import("./collector.js").default, consumed: number}[]} */
    #inputs;

    #prepared = false;

    #accepted = true;

    /** @type {(() => void)[]} */
    #disposers = [];

    /** @param {import("./flowNode.js").default} node */
    constructor(node) {
        this.#node = node;
        this.#inputs = Array.from(
            new Set(node.dataDependencies),
            (collector) => ({
                collector,
                consumed: -1,
            })
        );
        for (const input of this.#inputs) {
            this.#disposers.push(
                input.collector.observe(() => {
                    if (
                        node.parent &&
                        node.completed &&
                        !this.isReady() &&
                        node.areDataDependenciesAvailable()
                    ) {
                        node.requestRepropagate();
                    }
                })
            );
        }
    }

    dispose() {
        for (const dispose of this.#disposers) dispose();
        this.#disposers.length = 0;
    }

    reset() {
        this.#prepared = false;
        this.#accepted = true;
        for (const input of this.#inputs) input.consumed = -1;
    }

    /** Capture at batch preparation, including a skipped/pending batch. */
    consume() {
        if (!this.#node.areDataDependenciesAvailable()) {
            this.#accepted = false;
        } else if (!this.#prepared) {
            for (const input of this.#inputs)
                input.consumed = input.collector.dataRevision;
            this.#prepared = true;
        }
    }

    complete() {
        // Empty primary output can consume available inputs without an index.
        if (!this.#prepared) this.consume();
    }

    isReady() {
        return (
            this.#accepted &&
            this.#prepared &&
            this.#node.areDataDependenciesAvailable() &&
            this.#inputs.every(
                ({ collector, consumed }) => collector.dataRevision === consumed
            )
        );
    }
}
