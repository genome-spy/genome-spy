/**
 * Thin fetch wrappers for the relay proxy endpoints at
 * `/v1/alphagenome` and `/v1/evo2`.  The relay adds a 600-second
 * timeout and forwards errors as HTTP 502s.
 */

/**
 * @param {string} baseUrl - Base URL of the relay server (no trailing slash).
 * @param {object} payload - AlphaGenome ScoreRequest body.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ scores: Array<Record<string, number[]>> }>}
 */
export async function scoreWithAlphaGenome(baseUrl, payload, signal) {
    return /** @type {any} */ (
        _postJson(`${baseUrl}/v1/alphagenome`, payload, signal, "AlphaGenome")
    );
}

/**
 * @param {string} baseUrl - Base URL of the relay server (no trailing slash).
 * @param {object} payload - Evo2 scoring request body.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ scores: Array<{ delta: number | null }> }>}
 */
export async function scoreWithEvo2(baseUrl, payload, signal) {
    return /** @type {any} */ (
        _postJson(`${baseUrl}/v1/evo2`, payload, signal, "Evo2")
    );
}

/**
 * @param {string} url
 * @param {object} body
 * @param {AbortSignal | undefined} signal
 * @param {string} serverName
 * @returns {Promise<object>}
 */
async function _postJson(url, body, signal, serverName) {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${serverName} server error ${resp.status}: ${text}`);
    }
    return resp.json();
}
