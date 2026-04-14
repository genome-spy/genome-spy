/* global console */
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { formatGeneratedSource } from "./formatGeneratedSource.mjs";

const execFileAsync = promisify(execFile);

// The planner tool input contract is defined in src/agent/agentToolInputs.d.ts.
// This script projects that documented contract into JSON Schema.
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
            "src/agent/agentToolInputs.d.ts",
            "--type",
            "AgentToolInputs",
            "--no-type-check",
        ],
        {
            cwd: packageRoot,
            maxBuffer: 10 * 1024 * 1024,
        }
    );

    return formatGeneratedSource(
        normalizeSchemaText(stdout),
        fileURLToPath(schemaPath)
    );
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
