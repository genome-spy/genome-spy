/* global console */
import { fileURLToPath, URL } from "node:url";
import { readFile } from "node:fs/promises";
import { generateSchemaText } from "./generateAgentActionSchema.mjs";

const schemaPath = new URL(
    "../src/agent/generatedActionSchema.json",
    import.meta.url
);

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeSchemaText(text) {
    return text.replace(/\n+$/, "\n");
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    const [generated, current] = await Promise.all([
        generateSchemaText(),
        readFile(schemaPath, "utf8"),
    ]);

    if (generated !== normalizeSchemaText(current)) {
        throw new Error(
            "Generated action schema is out of date. Run `npm run generate:agent-schema`."
        );
    }

    console.log("Generated action schema is up to date.");
}

await main();
