/**
 * Error thrown when a fetch succeeds but returns a non-2xx status.
 */
export class HttpStatusError extends Error {
    /**
     * @param {number} status
     * @param {string} statusText
     */
    constructor(status, statusText) {
        super(String(status) + " " + statusText);
        this.status = status;
        this.statusText = statusText;
    }
}

/**
 * Error thrown when a response cannot be parsed as JSON.
 */
export class JsonParseError extends Error {}

/**
 * Fetches JSON from a URL and throws explicit errors for HTTP status and
 * JSON parsing failures.
 *
 * @param {string} url
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, options = {}) {
    let response;
    try {
        response = await fetch(url, { signal: options.signal });
    } catch (error) {
        throw new Error(String(error));
    }

    if (!response.ok) {
        throw new HttpStatusError(response.status, response.statusText);
    }

    try {
        return await response.json();
    } catch (error) {
        throw new JsonParseError(String(error));
    }
}
