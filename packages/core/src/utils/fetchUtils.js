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
        throw new Error("Network error: " + String(error));
    }

    if (!response.ok) {
        throw new Error(
            "HTTP " + String(response.status) + " " + response.statusText
        );
    }

    try {
        return await response.json();
    } catch (error) {
        throw new Error("Invalid JSON: " + String(error));
    }
}
