import FlatQueue from "flatqueue";

const RUNTIME_NODE = Symbol("runtimeNode");
const PRIORITY_STRIDE = 1000000;

/**
 * @typedef {(listener: () => void) => () => void} SubscribeFn
 *
 * @typedef {{
 *   id: string,
 *   rank: number,
 *   disposed: boolean,
 *   listeners: Set<() => void>,
 *   subscribe: SubscribeFn
 * }} RuntimeNodeBase
 */

/**
 * @template T
 * @typedef {RuntimeNodeBase & {
 *   value: T,
 *   kind: "base" | "selection",
 *   name: string
 * }} WritableNode
 */

/**
 * @template T
 * @typedef {RuntimeNodeBase & {
 *   value: T,
 *   kind: "derived",
 *   name: string,
 *   fn: () => T
 * }} ComputedNode
 */

/**
 * @typedef {{
 *   id: string,
 *   rank: number,
 *   disposed: boolean,
 *   fn: () => void
 * }} EffectNode
 */

/**
 * @param {import("./lifecycleRegistry.js").default | undefined} lifecycleRegistry
 * @returns {(ownerId: string, disposer: () => void) => void}
 */
function createDisposerBinder(lifecycleRegistry) {
    if (!lifecycleRegistry) {
        return () => undefined;
    } else {
        return (ownerId, disposer) => {
            lifecycleRegistry.addDisposer(ownerId, disposer);
        };
    }
}

/**
 * @template T
 * @param {RuntimeNodeBase & { value: T, kind: "base" | "derived" | "selection", name: string }} node
 * @param {(value: T) => void} [setter]
 * @returns {import("./types.js").ParamRef<T> | import("./types.js").WritableParamRef<T>}
 */
function createRef(node, setter) {
    /**
     * @type {import("./types.js").ParamRef<any>}
     */
    const ref = {
        id: node.id,
        name: node.name,
        kind: node.kind,
        get() {
            return node.value;
        },
        subscribe(listener) {
            node.listeners.add(listener);

            return () => {
                node.listeners.delete(listener);
            };
        },
    };

    Object.defineProperty(ref, RUNTIME_NODE, {
        enumerable: false,
        configurable: false,
        writable: false,
        value: node,
    });

    if (setter) {
        return Object.assign(ref, {
            set(
                /** @type {T} */
                value
            ) {
                setter(value);
            },
        });
    } else {
        return ref;
    }
}

/**
 * @param {import("./types.js").ParamRef<any>} ref
 * @returns {RuntimeNodeBase}
 */
function getNode(ref) {
    const node = /** @type {RuntimeNodeBase | undefined} */ (
        /** @type {any} */ (ref)[RUNTIME_NODE]
    );
    if (!node) {
        throw new Error(
            "ParamRef is not bound to this graph runtime. Expected runtime-created ref."
        );
    }

    return node;
}

/**
 * @param {Set<() => void>} listeners
 */
function notify(listeners) {
    for (const listener of listeners) {
        listener();
    }
}

export default class GraphRuntime {
    #nextNodeId = 1;

    #nextQueueSequence = 1;

    #transactionDepth = 0;

    #scheduled = false;

    #flushing = false;

    /** @type {Set<ComputedNode<any>>} */
    #dirtyComputeds = new Set();

    /** @type {Set<EffectNode>} */
    #dirtyEffects = new Set();

    /** @type {FlatQueue<ComputedNode<any>>} */
    #computedQueue = new FlatQueue();

    /** @type {FlatQueue<EffectNode>} */
    #effectQueue = new FlatQueue();

    /** @type {Set<{resolve: () => void, reject: (error: Error) => void, abortHandler?: () => void, timeoutId?: ReturnType<typeof setTimeout>}>} */
    #propagatedWaiters = new Set();

    /** @type {(ownerId: string, disposer: () => void) => void} */
    #bindDisposer;

    /**
     * @param {object} [options]
     * @param {import("./lifecycleRegistry.js").default} [options.lifecycleRegistry]
     */
    constructor(options = {}) {
        this.#bindDisposer = createDisposerBinder(options.lifecycleRegistry);
    }

    /**
     * @template T
     * @param {string} ownerId
     * @param {string} name
     * @param {"base" | "selection"} kind
     * @param {T} initialValue
     * @param {{ notify?: boolean }} [options]
     * @returns {import("./types.js").WritableParamRef<T>}
     */
    createWritable(ownerId, name, kind, initialValue, options = {}) {
        const nodeId = "n" + this.#nextNodeId++;
        const notifyOnSet = options.notify ?? true;

        const node = /** @type {WritableNode<T>} */ ({
            id: nodeId,
            name,
            kind,
            value: initialValue,
            rank: 0,
            disposed: false,
            listeners: new Set(),
            subscribe(
                /** @type {() => void} */
                listener
            ) {
                node.listeners.add(listener);
                return () => {
                    node.listeners.delete(listener);
                };
            },
        });

        const setter = (
            /** @type {T} */
            value
        ) => {
            if (node.disposed) {
                throw new Error(
                    'Cannot set disposed parameter "' +
                        name +
                        '" (' +
                        nodeId +
                        ")."
                );
            }

            if (value !== node.value) {
                node.value = value;
                if (notifyOnSet) {
                    notify(node.listeners);
                    this.#scheduleFlush();
                }
            }
        };

        this.#bindDisposer(ownerId, () => {
            node.disposed = true;
            node.listeners.clear();
        });

        return /** @type {import("./types.js").WritableParamRef<T>} */ (
            createRef(node, setter)
        );
    }

    /**
     * @template T
     * @param {string} ownerId
     * @param {string} name
     * @param {import("./types.js").ParamRef<any>[]} deps
     * @param {() => T} fn
     * @returns {import("./types.js").ParamRef<T>}
     */
    computed(ownerId, name, deps, fn) {
        const depNodes = deps.map(getNode);
        const maxRank = depNodes.reduce(
            (previous, node) => Math.max(previous, node.rank),
            0
        );

        const nodeId = "n" + this.#nextNodeId++;
        const node = /** @type {ComputedNode<T>} */ ({
            id: nodeId,
            name,
            kind: "derived",
            rank: maxRank + 1,
            value: fn(),
            disposed: false,
            listeners: new Set(),
            fn,
            subscribe(
                /** @type {() => void} */
                listener
            ) {
                node.listeners.add(listener);
                return () => {
                    node.listeners.delete(listener);
                };
            },
        });

        const onDependencyChange = () => {
            if (!node.disposed) {
                this.#enqueueComputed(node);
            }
        };

        const unsubscribers = deps.map((dep) =>
            dep.subscribe(onDependencyChange)
        );
        const dispose = () => {
            if (node.disposed) {
                return;
            }

            node.disposed = true;
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            node.listeners.clear();
            this.#dirtyComputeds.delete(node);
        };

        this.#bindDisposer(ownerId, dispose);

        return /** @type {import("./types.js").ParamRef<T>} */ (
            createRef(node)
        );
    }

    /**
     * @param {string} ownerId
     * @param {import("./types.js").ParamRef<any>[]} deps
     * @param {() => void} fn
     * @returns {() => void}
     */
    effect(ownerId, deps, fn) {
        const depNodes = deps.map(getNode);
        const maxRank = depNodes.reduce(
            (previous, node) => Math.max(previous, node.rank),
            0
        );

        const nodeId = "n" + this.#nextNodeId++;
        const node = /** @type {EffectNode} */ ({
            id: nodeId,
            rank: maxRank + 1,
            disposed: false,
            fn,
        });

        const onDependencyChange = () => {
            if (!node.disposed) {
                this.#enqueueEffect(node);
            }
        };

        const unsubscribers = deps.map((dep) =>
            dep.subscribe(onDependencyChange)
        );

        const dispose = () => {
            if (node.disposed) {
                return;
            }

            node.disposed = true;
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            this.#dirtyEffects.delete(node);
        };

        this.#bindDisposer(ownerId, dispose);

        return dispose;
    }

    /**
     * Runs `fn` as an atomic update transaction for this runtime graph.
     *
     * Transaction intent:
     * 1. Batch multiple source writes so downstream computeds/effects observe
     *    the final state for the batch, not each intermediate write.
     * 2. Defer scheduling/flush until the outermost transaction exits.
     * 3. Preserve deterministic propagation order by running one flush pass
     *    after the transaction boundary.
     *
     * Semantics:
     * 1. Nested transactions are supported via depth counting.
     * 2. Only the outermost transaction exit triggers scheduling.
     * 3. If `fn` throws, the error is rethrown after transaction depth is
     *    restored; pending propagation is still scheduled from `finally`.
     * 4. This method does not force immediate synchronous propagation. Use
     *    `flushNow()` when the caller explicitly requires immediate flushing.
     *
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    runInTransaction(fn) {
        this.#transactionDepth += 1;
        try {
            return fn();
        } finally {
            this.#transactionDepth -= 1;
            if (this.#transactionDepth === 0) {
                this.#scheduleFlush();
            }
        }
    }

    flushNow() {
        if (this.#transactionDepth > 0 || this.#flushing) {
            return;
        } else {
            this.#scheduled = false;
            this.#flushing = true;
        }

        try {
            let hasWork = true;
            while (hasWork) {
                hasWork = false;

                while (this.#computedQueue.length > 0) {
                    hasWork = true;
                    const node = this.#computedQueue.pop();
                    this.#dirtyComputeds.delete(node);

                    if (node.disposed) {
                        continue;
                    }

                    const previous = node.value;
                    const next = node.fn();
                    if (next !== previous) {
                        node.value = next;
                        notify(node.listeners);
                    }
                }

                while (this.#effectQueue.length > 0) {
                    hasWork = true;
                    const effectNode = this.#effectQueue.pop();
                    this.#dirtyEffects.delete(effectNode);

                    if (effectNode.disposed) {
                        continue;
                    }

                    effectNode.fn();
                }
            }
        } finally {
            this.#flushing = false;
            this.#maybeResolveWhenPropagatedWaiters();
        }
    }

    /**
     * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
     * @returns {Promise<void>}
     */
    whenPropagated(options = {}) {
        if (this.#isSettled()) {
            return Promise.resolve();
        }

        const { signal, timeoutMs } = options;
        if (signal?.aborted) {
            return Promise.reject(new Error("whenPropagated aborted"));
        }

        return new Promise((resolve, reject) => {
            const waiter =
                /** @type {{resolve: () => void, reject: (error: Error) => void, abortHandler?: () => void, timeoutId?: ReturnType<typeof setTimeout>}} */ ({
                    resolve,
                    reject,
                });

            if (signal) {
                waiter.abortHandler = () => {
                    this.#propagatedWaiters.delete(waiter);
                    reject(new Error("whenPropagated aborted"));
                };
                signal.addEventListener("abort", waiter.abortHandler, {
                    once: true,
                });
            }

            if (timeoutMs != null) {
                waiter.timeoutId = setTimeout(() => {
                    this.#propagatedWaiters.delete(waiter);
                    if (waiter.abortHandler) {
                        signal?.removeEventListener(
                            "abort",
                            waiter.abortHandler
                        );
                    }
                    reject(
                        new Error(
                            "whenPropagated timeout after " + timeoutMs + " ms"
                        )
                    );
                }, timeoutMs);
            }

            this.#propagatedWaiters.add(waiter);
        });
    }

    /**
     * @param {ComputedNode<any>} node
     */
    #enqueueComputed(node) {
        if (this.#dirtyComputeds.has(node)) {
            return;
        }

        this.#dirtyComputeds.add(node);
        this.#computedQueue.push(node, this.#computePriority(node.rank));
        this.#scheduleFlush();
    }

    /**
     * @param {EffectNode} node
     */
    #enqueueEffect(node) {
        if (this.#dirtyEffects.has(node)) {
            return;
        }

        this.#dirtyEffects.add(node);
        this.#effectQueue.push(node, this.#computePriority(node.rank));
        this.#scheduleFlush();
    }

    /**
     * @param {number} rank
     */
    #computePriority(rank) {
        const sequence = this.#nextQueueSequence % PRIORITY_STRIDE;
        this.#nextQueueSequence += 1;
        return rank * PRIORITY_STRIDE + sequence;
    }

    #scheduleFlush() {
        if (this.#transactionDepth > 0 || this.#scheduled || this.#flushing) {
            return;
        }

        this.#scheduled = true;

        queueMicrotask(() => {
            this.flushNow();
        });
    }

    #isSettled() {
        return (
            this.#transactionDepth === 0 &&
            !this.#scheduled &&
            !this.#flushing &&
            this.#computedQueue.length === 0 &&
            this.#effectQueue.length === 0 &&
            this.#dirtyComputeds.size === 0 &&
            this.#dirtyEffects.size === 0
        );
    }

    #maybeResolveWhenPropagatedWaiters() {
        if (!this.#isSettled()) {
            return;
        }

        for (const waiter of this.#propagatedWaiters) {
            if (waiter.timeoutId) {
                clearTimeout(waiter.timeoutId);
            }

            waiter.resolve();
        }
        this.#propagatedWaiters.clear();
    }
}

export { getNode };
