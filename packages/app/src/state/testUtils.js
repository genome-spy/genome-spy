/**
 * Await a microtask tick so queued microtasks run.
 *
 * @returns {Promise<void>}
 */
export function flushMicrotasks() {
    return new Promise((resolve) => queueMicrotask(resolve));
}
