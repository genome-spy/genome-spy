/** @typedef {import("../types/embedApi.js").SpecLocation} SpecLocation */

/**
 * Returns the nearest specification location on an error or its causes.
 * @param {unknown} error
 * @returns {SpecLocation | undefined}
 */
export function getSpecErrorLocation(error) {
    const seen = new Set();
    while (error instanceof Error && !seen.has(error)) {
        seen.add(error);
        const location = /** @type {Error & {specLocation?: SpecLocation}} */ (
            error
        ).specLocation;
        if (location) return location;
        error = error.cause;
    }
}

/**
 * Adds declaration context without replacing a more specific error or cause.
 * @param {unknown} error
 * @param {SpecLocation | undefined} location
 */
export function annotateSpecError(error, location) {
    if (error instanceof Error && location && !getSpecErrorLocation(error)) {
        Object.assign(error, { specLocation: location });
    }
    return error;
}
