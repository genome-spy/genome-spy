/**
 * @param {(...args:T) => R} func
 * @param {number | (() => number)} wait
 * @template {any[]} T
 * @template R
 */
export function debounce(func, wait, rejectOnDebounce = true) {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timeout;

    /** @type {(reason?: any) => void} */
    let rejectPrevious = (_) => undefined;

    /**
     * @param {T} args
     * @return {Promise<R>} */
    const debouncer = function debouncer(...args) {
        return new Promise((resolve, reject) => {
            const later = () => {
                clearTimeout(timeout);
                rejectPrevious = (_) => undefined;

                resolve(func(...args));
            };

            if (rejectOnDebounce) {
                rejectPrevious("debounced");
            }
            clearTimeout(timeout);

            rejectPrevious = reject;
            timeout = setTimeout(
                later,
                typeof wait == "function" ? wait() : wait
            );
        });
    };

    return debouncer;
}
