/**
 * Readiness helpers for async workflows.
 *
 * These helpers standardize "wait until ready" flows with optional AbortSignal
 * support, so callers don't repeat promise/abort boilerplate. Use ReadyGate for
 * a single readiness cycle that can be reset, and ReadyWaiterSet when multiple
 * concurrent waiters need to resolve based on a matching predicate.
 *
 * @template T
 * @returns {{promise: Promise<T>, resolve: (value?: T) => void, reject: (error: Error) => void}}
 */
function createDeferred() {
    /** @type {(value?: T) => void} */
    let resolve;
    /** @type {(error: Error) => void} */
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/**
 * @returns {{promise: Promise<void>, resolve: (value?: void) => void, reject: (error: Error) => void}}
 */
function createResolvedDeferred() {
    return {
        promise: Promise.resolve(),
        resolve: () => undefined,
        reject: () => undefined,
    };
}

/**
 * Wraps a promise with AbortSignal handling.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {string} abortMessage
 * @param {AbortSignal} [signal]
 * @param {() => void} [onAbort]
 * @returns {Promise<T>}
 */
function awaitWithAbort(promise, abortMessage, signal, onAbort) {
    if (!signal) {
        return promise;
    }

    return new Promise((resolve, reject) => {
        const abortHandler = () => {
            if (onAbort) {
                onAbort();
            }
            reject(new Error(abortMessage));
        };

        if (signal.aborted) {
            abortHandler();
            return;
        }

        signal.addEventListener("abort", abortHandler, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", abortHandler);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", abortHandler);
                reject(error);
            }
        );
    });
}

/**
 * Tracks a single readiness promise and provides abort-aware awaiting.
 *
 * Use this when you have a single "ready" cycle at a time (e.g. metadata
 * updates) and want to reset the gate whenever a new cycle starts.
 */
export class ReadyGate {
    /** @type {string} */
    #abortMessage;

    /** @type {{promise: Promise<void>, resolve: (value?: void) => void, reject: (error: Error) => void}} */
    #current = createResolvedDeferred();

    /**
     * @param {string} abortMessage
     */
    constructor(abortMessage) {
        this.#abortMessage = abortMessage;
    }

    /**
     * Starts a new readiness cycle and returns the deferred handle.
     *
     * @returns {{promise: Promise<void>, resolve: (value?: void) => void, reject: (error: Error) => void}}
     */
    reset() {
        const deferred = createDeferred();
        this.#current = deferred;
        return deferred;
    }

    /**
     * Waits until the current readiness promise settles.
     *
     * @param {AbortSignal} [signal]
     * @returns {Promise<void>}
     */
    wait(signal) {
        return awaitWithAbort(
            this.#current.promise,
            this.#abortMessage,
            signal
        );
    }
}

/**
 * Creates a finalize helper that resolves or rejects a readiness handle once.
 *
 * Promises ignore extra resolve/reject calls, but callers may have additional
 * side effects tied to finalization. This guard keeps those side effects
 * single-shot even if multiple code paths attempt to finalize.
 *
 * @param {{resolve: (value?: void) => void, reject: (error: Error) => void}} ready
 * @returns {(error?: Error) => void}
 */
export function createFinalizeOnce(ready) {
    let finalized = false;

    return (error) => {
        if (finalized) {
            return;
        }
        finalized = true;
        if (error) {
            ready.reject(error);
        } else {
            ready.resolve();
        }
    };
}

/**
 * Coordinates multiple readiness waiters keyed by a predicate.
 *
 * Use this when callers wait for a specific readiness event (e.g. subtree
 * data-ready broadcasts) and the resolver can identify matching events.
 *
 * @template T
 */
export class ReadyWaiterSet {
    /** @type {Set<{predicate: (value: T) => boolean, resolve: () => void}>} */
    #waiters = new Set();

    /** @type {string} */
    #abortMessage;

    /**
     * @param {string} abortMessage
     */
    constructor(abortMessage) {
        this.#abortMessage = abortMessage;
    }

    /**
     * Waits for a matching resolve call.
     *
     * @param {(value: T) => boolean} predicate
     * @param {AbortSignal} [signal]
     * @returns {Promise<void>}
     */
    wait(predicate, signal) {
        /** @type {(value?: void) => void} */
        let resolve;
        const promise = new Promise((res) => {
            resolve = res;
        });
        const waiter = { predicate, resolve };
        this.#waiters.add(waiter);

        return awaitWithAbort(promise, this.#abortMessage, signal, () => {
            this.#waiters.delete(waiter);
        });
    }

    /**
     * Resolves any waiters that match the provided value.
     *
     * @param {T} value
     */
    resolveMatching(value) {
        if (!this.#waiters.size) {
            return;
        }

        for (const waiter of this.#waiters) {
            if (!waiter.predicate(value)) {
                continue;
            }
            this.#waiters.delete(waiter);
            waiter.resolve();
        }
    }
}
