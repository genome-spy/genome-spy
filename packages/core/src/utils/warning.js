const emittedWarnings = new Set();

/**
 * Prints a warning once per JavaScript realm.
 *
 * @param {string} message
 */
export function warnOnce(message) {
    if (!emittedWarnings.has(message)) {
        emittedWarnings.add(message);
        console.warn(message);
    }
}
