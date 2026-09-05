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
 *   fn: () => T,
 *   equals: (a: T, b: T) => boolean
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
 * @returns {(ownerId: string, disposer: () => void) => () => void}
 */
function createDisposerBinder(lifecycleRegistry) {
    if (!lifecycleRegistry) {
        return () => () => undefined;
    } else {
        return (ownerId, disposer) => {
            return lifecycleRegistry.addDisposer(ownerId, disposer);
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
 * @param {import("./types.js").ParamRef<any>} dep
 * @returns {number}
 */
function getDependencyRank(dep) {
    if (typeof (/** @type {any} */ (dep).rank) === "number") {
        return /** @type {any} */ (dep).rank;
    }
    return getNode(dep).rank;
}

/**
 * @param {Set<() => void>} listeners
 */
function notify(listeners) {
    for (const listener of listeners) {
        listener();
    }
}

/**
 * Low-level reactive DAG runtime for parameter propagation.
 *
 * `GraphRuntime` is the scheduling engine behind `ParamRuntime`. It owns:
 * 1. Writable source nodes (`base` and `selection`).
 * 2. Derived/computed nodes with explicit dependencies.
 * 3. Streaming publication jobs and effects that observe their settled results.
 * 4. Transaction-aware batching and deterministic topological flushing.
 *
 * Typical usage:
 * 1. Create writable refs using `createWritable(...)`.
 * 2. Build derived refs with `computed(...)` from existing refs.
 * 3. Attach side effects with `effect(...)` when external work is needed.
 * 4. Batch writes with `runInTransaction(...)` when multiple updates belong to
 *    one logical state transition.
 * 5. Await `whenPropagated(...)` when callers need a "graph is settled" barrier.
 *
 * Notes:
 * 1. This class is intended for runtime internals; most call sites should use
 *    `ParamRuntime` / `ViewParamRuntime`.
 * 2. Equality is referential by default. Computeds may supply value equality.
 * 3. Direct subscriptions are invalidations; use effects for settled observation.
 */
export default class GraphRuntime {
    #nextNodeId = 1;

    #nextQueueSequence = 1;

    #transactionDepth = 0;

    #scheduled = false;

    #flushing = false;

    #notificationDepth = 0;

    #syncRequested = false;

    /** @type {Map<() => void, number>} */
    #updates = new Map();

    /** @type {Map<object, number>} */
    #runCounts = new Map();

    /** @type {Set<ComputedNode<any>>} */
    #dirtyComputeds = new Set();

    /** @type {Set<EffectNode>} */
    #dirtyEffects = new Set();

    /** @type {FlatQueue<ComputedNode<any>>} */
    #computedQueue = new FlatQueue();

    /** @type {FlatQueue<EffectNode>} */
    #effectQueue = new FlatQueue();

    /** @type {Set<{resolve: () => void, reject: (error: unknown) => void}>} */
    #propagatedWaiters = new Set();

    /** @type {(ownerId: string, disposer: () => void) => () => void} */
    #bindDisposer;

    /**
     * Creates a graph runtime.
     *
     * @param {object} [options]
     * @param {import("./lifecycleRegistry.js").default} [options.lifecycleRegistry]
     *      Optional lifecycle owner registry. When provided, all created nodes
     *      are bound to owners and disposed automatically on owner disposal.
     */
    constructor(options = {}) {
        this.#bindDisposer = createDisposerBinder(options.lifecycleRegistry);
    }

    /**
     * Registers a writable source node and returns a writable param ref.
     *
     * Write semantics:
     * 1. A write triggers propagation only when `value !== currentValue`.
     * 2. If `options.notify` is `false`, local listeners are not notified and
     *    downstream scheduling is skipped for writes to this ref.
     * 3. Writing to a disposed ref throws.
     *
     * Lifecycle:
     * 1. The node is owner-bound via `ownerId`.
     * 2. Owner disposal marks the node disposed and clears listeners.
     *
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
                    // Computed/effect listeners schedule after they enqueue
                    // graph work. Direct listeners are synchronous and need no
                    // otherwise-empty flush microtask.
                    this.#notify(node.listeners);
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
     * Registers a derived node whose value is computed from dependencies.
     *
     * Compute semantics:
     * 1. Initial value is computed eagerly at registration time.
     * 2. On dependency changes, recomputation is queued (deduplicated per flush).
     * 3. Downstream listeners are notified only if computed equality changes.
     * 4. Dependencies marked for synchronous propagation flush the queue before
     *    their notification returns.
     *
     * Lifecycle:
     * 1. Dependency subscriptions are created immediately.
     * 2. Owner disposal unsubscribes dependencies and detaches the node.
     *
     * @template T
     * @param {string} ownerId
     * @param {string} name
     * @param {import("./types.js").ParamRef<any>[]} deps
     * @param {() => T} fn
     * @param {{ equals?: (a: T, b: T) => boolean }} [options]
     * @returns {import("./types.js").ComputedParamRef<T>}
     */
    computed(ownerId, name, deps, fn, options = {}) {
        const maxRank = deps.reduce(
            (previous, dep) => Math.max(previous, getDependencyRank(dep)),
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
            equals: options.equals ?? ((a, b) => a === b),
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

        const unsubscribers = deps.map((dep) =>
            dep.subscribe(() => {
                if (!node.disposed) {
                    this.#enqueueComputed(node);
                    if (dep.propagation === "sync") {
                        // Scale changes are synchronous and happen before
                        // rendering, so their derived values must not lag.
                        this.flushNow();
                    }
                }
            })
        );
        const dispose = () => {
            if (node.disposed) {
                return;
            }

            node.disposed = true;
            unbind();
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            node.listeners.clear();
            this.#dirtyComputeds.delete(node);
        };

        const unbind = this.#bindDisposer(ownerId, dispose);

        return Object.assign(
            /** @type {import("./types.js").ParamRef<T>} */ (createRef(node)),
            { dispose }
        );
    }

    /**
     * Registers an effect node that runs after computed propagation.
     *
     * Effect semantics:
     * 1. Effect callbacks are queued on dependency changes.
     * 2. Effects run after computed nodes and streaming jobs have settled.
     * 3. Multiple dependency changes before a flush coalesce to one queued run.
     *
     * @param {string} ownerId
     * @param {import("./types.js").ParamRef<any>[]} deps
     * @param {() => void} fn
     * @returns {() => void} explicit disposer for manual teardown
     */
    effect(ownerId, deps, fn) {
        const maxRank = deps.reduce(
            (previous, dep) => Math.max(previous, getDependencyRank(dep)),
            0
        );

        const nodeId = "n" + this.#nextNodeId++;
        const node = /** @type {EffectNode} */ ({
            id: nodeId,
            rank: maxRank + 1,
            disposed: false,
            fn,
        });

        const unsubscribers = deps.map((dep) =>
            dep.subscribe(() => {
                if (!node.disposed) {
                    this.#enqueueEffect(node);
                    if (dep.propagation === "sync") {
                        this.flushNow();
                    }
                }
            })
        );

        const dispose = () => {
            if (node.disposed) {
                return;
            }

            node.disposed = true;
            unbind();
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            this.#dirtyEffects.delete(node);
        };

        const unbind = this.#bindDisposer(ownerId, dispose);

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
     * 4. The scheduled flush runs in a microtask (`queueMicrotask`) after the
     *    outermost transaction exits.
     * 5. This method does not force immediate synchronous propagation. Use
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

    /**
     * Flushes currently queued computed/effect work immediately.
     *
     * Behavior:
     * 1. No-op if called while a transaction is open.
     * 2. No-op during re-entrant flush calls.
     * 3. Stabilizes computeds and streaming jobs before each effect.
     * 4. Errors reject current barriers and stop automatic flushing. Pending
     *    invalidations remain for an explicit retry; replay jobs must be resubmitted.
     */
    flushNow() {
        if (this.#notificationDepth > 0) {
            this.#syncRequested = true;
            return;
        }
        if (this.#transactionDepth > 0 || this.#flushing) {
            return;
        }
        this.#scheduled = false;
        this.#flushing = true;

        try {
            while (
                this.#computedQueue.length ||
                this.#updates.size ||
                this.#effectQueue.length
            ) {
                while (this.#computedQueue.length) {
                    const node = this.#computedQueue.pop();
                    this.#dirtyComputeds.delete(node);
                    if (node.disposed) {
                        continue;
                    }
                    this.#countRun(node, node.name);
                    let next;
                    try {
                        next = node.fn();
                    } catch (error) {
                        this.#enqueueComputed(node);
                        throw error;
                    }
                    if (!node.equals(next, node.value)) {
                        node.value = next;
                        this.#notify(node.listeners);
                    }
                }

                if (this.#updates.size) {
                    // Replay roots are few; ordering by tree depth lets an
                    // ancestor subsume queued descendants without per-row work.
                    let priority = Infinity;
                    /** @type {() => void} */
                    let update;
                    for (const [candidate, rank] of this.#updates) {
                        if (rank < priority) {
                            update = candidate;
                            priority = rank;
                        }
                    }
                    this.#updates.delete(update);
                    this.#countRun(update, "streaming update");
                    update();
                } else if (this.#effectQueue.length) {
                    const node = this.#effectQueue.pop();
                    this.#dirtyEffects.delete(node);
                    if (!node.disposed) {
                        this.#countRun(node, "effect " + node.id);
                        node.fn();
                    }
                }
                // An update or effect may publish new sources. Stabilize those
                // before allowing the next observer to run.
            }
        } catch (error) {
            // Keep invalidations: a retry may publish an equal value and must
            // still repair caches. Do not automatically retry streaming work.
            this.#updates.clear();
            for (const waiter of this.#propagatedWaiters) {
                waiter.reject(error);
            }
            this.#propagatedWaiters.clear();
            throw error;
        } finally {
            this.#runCounts.clear();
            this.#flushing = false;
            this.#maybeResolveWhenPropagatedWaiters();
        }
    }

    /**
     * Queue a stable callback that publishes streaming results before effects.
     * The caller owns its lifetime; rank orders upstream roots before descendants.
     * @param {() => void} update
     * @param {number} [rank]
     */
    requestUpdate(update, rank = 0) {
        this.#updates.set(update, rank);
        this.#scheduleFlush();
    }

    /** @param {() => void} update */
    cancelUpdate(update) {
        this.#updates.delete(update);
    }

    /** @param {Set<() => void>} listeners */
    #notify(listeners) {
        this.#notificationDepth++;
        try {
            notify(listeners);
        } finally {
            this.#notificationDepth--;
            if (!this.#notificationDepth && this.#syncRequested) {
                this.#syncRequested = false;
                this.flushNow();
            }
        }
    }

    /**
     * Bound imperative feedback without mistaking a second round for a cycle.
     * @param {object} work
     * @param {string} name
     */
    #countRun(work, name) {
        const count = (this.#runCounts.get(work) ?? 0) + 1;
        if (count > 100) {
            throw new Error("Reactive propagation did not settle: " + name);
        }
        this.#runCounts.set(work, count);
    }

    /**
     * Returns a promise that resolves when currently pending graph propagation
     * has completed (computeds, streaming jobs, and effects are settled).
     *
     * This is a synchronization barrier for reactive propagation only. It does
     * not include animation/time-based convergence semantics.
     *
     * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
     *      Optional cancellation/timeout controls for waiting callers.
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
            /** @type {ReturnType<typeof setTimeout> | undefined} */
            let timeoutId;
            const cleanup = () => {
                this.#propagatedWaiters.delete(waiter);
                signal?.removeEventListener("abort", abort);
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
            };
            const waiter = {
                resolve: () => {
                    cleanup();
                    resolve();
                },
                reject: (/** @type {unknown} */ error) => {
                    cleanup();
                    reject(error);
                },
            };
            const abort = () =>
                waiter.reject(new Error("whenPropagated aborted"));
            signal?.addEventListener("abort", abort, { once: true });
            if (timeoutMs != null) {
                timeoutId = setTimeout(
                    () =>
                        waiter.reject(
                            new Error(
                                "whenPropagated timeout after " +
                                    timeoutMs +
                                    " ms"
                            )
                        ),
                    timeoutMs
                );
            }
            this.#propagatedWaiters.add(waiter);
        });
    }

    /**
     * @param {ComputedNode<any>} node
     */
    #enqueueComputed(node) {
        if (this.#dirtyComputeds.has(node)) {
            this.#scheduleFlush();
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
            this.#scheduleFlush();
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
            // A synchronous flush may have completed or failed since scheduling.
            if (this.#scheduled) {
                this.flushNow();
            }
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
            this.#dirtyEffects.size === 0 &&
            this.#updates.size === 0
        );
    }

    #maybeResolveWhenPropagatedWaiters() {
        if (!this.#isSettled()) {
            return;
        }

        for (const waiter of this.#propagatedWaiters) {
            waiter.resolve();
        }
        this.#propagatedWaiters.clear();
    }
}

export { getNode };
