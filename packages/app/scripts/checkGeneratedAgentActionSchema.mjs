/* global console */
import { execFile } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const schemaPath = new URL(
    "../src/agent/generatedActionSchema.json",
    import.meta.url
);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * @returns {Promise<string>}
 */
async function generateSchemaText() {
    const { stdout } = await execFileAsync("ts-json-schema-generator", [
        "--path",
        "src/agent/schemaContract.ts",
        "--type",
        "AgentIntentProgram",
        "--no-type-check",
    ], {
        cwd: packageRoot,
        maxBuffer: 10 * 1024 * 1024,
    });

    return stdout.endsWith("\n") ? stdout : stdout + "\n";
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    const [generated, current] = await Promise.all([
        generateSchemaText(),
        readFile(schemaPath, "utf8"),
    ]);

    if (generated !== current) {
        throw new Error(
            "Generated action schema is out of date. Run `npm run generate:agent-schema`."
        );
    }

    console.log("Generated action schema is up to date.");
}

await main();
