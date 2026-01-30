/**
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
 * @template T
 * Coordinates multiple readiness waiters keyed by a predicate.
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
