import { format, resolveConfig } from "prettier";

/**
 * @param {string} source
 * @param {string} filepath
 * @returns {Promise<string>}
 */
export async function formatGeneratedSource(source, filepath) {
    const config = await resolveConfig(filepath);
    return format(source, {
        ...config,
        filepath,
    });
}
