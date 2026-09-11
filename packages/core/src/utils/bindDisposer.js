/**
 * Binds an idempotent disposer to an owner's lifecycle.
 *
 * @param {(disposer: () => void) => void} registerDisposer
 * @param {() => void} disposer
 * @returns {() => void}
 */
export function bindDisposer(registerDisposer, disposer) {
    let disposed = false;
    const boundDisposer = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        disposer();
    };

    registerDisposer(boundDisposer);
    return boundDisposer;
}
