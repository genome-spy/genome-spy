/**
 * @param {(...args:T) => R} func
 * @param {number} wait
 * @template {any[]} T
 * @template R
 */
export function debounce(func, wait) {
    /** @type {number} */
    let timeout;

    /** @type {(reason?: any) => void} */
    let rejectPrevious = _ => undefined;

    /**
     * @param {T} args
     * @return {Promise<R>} */
    const debouncer = function debouncer(...args) {
        return new Promise((resolve, reject) => {
            const later = () => {
                clearTimeout(timeout);
                rejectPrevious = _ => undefined;

                resolve(func(...args));
            };

            rejectPrevious("debounced");
            clearTimeout(timeout);

            rejectPrevious = reject;
            timeout = setTimeout(later, wait);
        });
    };

    return debouncer;
}
