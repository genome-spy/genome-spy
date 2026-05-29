/**
 * Error thrown when an attribute info source cannot resolve a requested
 * attribute identifier.
 */
export class UnknownAttributeInfoError extends Error {
    /**
     * @param {string} message
     */
    constructor(message) {
        super(message);
        this.name = "UnknownAttributeInfoError";
    }
}
