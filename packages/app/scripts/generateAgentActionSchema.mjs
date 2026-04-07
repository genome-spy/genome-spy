/* global console */
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const schemaPath = new URL(
    "../src/agent/generatedActionSchema.json",
    import.meta.url
);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeSchemaText(text) {
    return text.replace(/\n+$/, "\n");
}

/**
 * @returns {Promise<string>}
 */
export async function generateSchemaText() {
    const { stdout } = await execFileAsync(
        "ts-json-schema-generator",
        [
            "--path",
            "src/agent/schemaContract.ts",
            "--type",
            "AgentIntentProgram",
            "--no-type-check",
        ],
        {
            cwd: packageRoot,
            maxBuffer: 10 * 1024 * 1024,
        }
    );

    return normalizeSchemaText(stdout);
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedActionSchema() {
    const generated = await generateSchemaText();
    await writeFile(schemaPath, generated);

    console.log("Wrote app/src/agent/generatedActionSchema.json");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    await writeGeneratedActionSchema();
}
