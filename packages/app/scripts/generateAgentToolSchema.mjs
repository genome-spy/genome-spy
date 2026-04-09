/* global console */
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const schemaPath = new URL(
    "../src/agent/generatedToolSchema.json",
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
export async function generateToolSchemaText() {
    const { stdout } = await execFileAsync(
        "npm",
        [
            "exec",
            "--",
            "ts-json-schema-generator",
            "--path",
            "src/agent/toolSchemaContract.ts",
            "--type",
            "AgentToolInputs",
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
export async function writeGeneratedToolSchema() {
    const generated = await generateToolSchemaText();
    await writeFile(schemaPath, generated);

    console.log("Wrote app/src/agent/generatedToolSchema.json");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    await writeGeneratedToolSchema();
}
