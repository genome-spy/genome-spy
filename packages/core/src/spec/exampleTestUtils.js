import { readFile } from "node:fs/promises";

/**
 * Serves the same local example assets as the dev server, without network access.
 * @param {Parameters<typeof fetch>[0]} input
 * @returns {Promise<Response>}
 */
export async function fetchExample(input) {
    const url = String(input);
    if (!url.startsWith("examples/")) {
        throw new Error("Unexpected example asset URL: " + url);
    }

    const vegaPrefix = "examples/vega-datasets/";
    const assetPath = url.startsWith(vegaPrefix)
        ? "node_modules/vega-datasets/data/" + url.slice(vegaPrefix.length)
        : url;
    const bytes = new Uint8Array(
        await readFile(new URL("../../../../" + assetPath, import.meta.url))
    );
    return new Response(bytes.buffer);
}
