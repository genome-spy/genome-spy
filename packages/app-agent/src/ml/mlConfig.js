/**
 * Shared singleton for the active ML scoring configuration.
 * Set by mlPlugin during install; read by the agent tool handler.
 *
 * @type {{ baseUrl: string; fastaUrl: string } | null}
 */
let _config = null;

/**
 * @param {{ baseUrl: string; fastaUrl: string }} config
 */
export function setMlConfig(config) {
    _config = config;
}

/**
 * @returns {{ baseUrl: string; fastaUrl: string } | null}
 */
export function getMlConfig() {
    return _config;
}
