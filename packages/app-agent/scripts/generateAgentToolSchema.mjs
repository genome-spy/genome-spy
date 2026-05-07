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
    "../src/agent/generated/generatedToolSchema.json",
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
 * The intent executor accepts canonical app action payloads, but the agent tool
 * contract accepts only agent-facing attribute candidates in action payloads:
 * sample metadata attributes and compact selection-aggregation candidates.
 * Keep the TypeScript source tied to the app payload types and relax only the
 * generated agent-facing tool schema.
 *
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
function relaxAgentAttributeIdentifiers(schema) {
    const definitions = schema.definitions;
    if (
        !definitions?.AttributeIdentifier ||
        !definitions?.SelectionAggregationCandidate
    ) {
        return schema;
    }

    definitions.AttributeIdentifier = {
        anyOf: [
            { $ref: "#/definitions/SampleAttributeIdentifier" },
            { $ref: "#/definitions/SelectionAggregationCandidate" },
        ],
    };
    delete definitions.AttributeIdentifierType;

    return schema;
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

    const schema = relaxAgentAttributeIdentifiers(JSON.parse(stdout));

    return formatGeneratedSource(
        normalizeSchemaText(JSON.stringify(schema, null, 2)),
        fileURLToPath(schemaPath)
    );
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedToolSchema() {
    const generated = await generateToolSchemaText();
    await writeFile(schemaPath, generated);

    console.log("Wrote app/src/agent/generated/generatedToolSchema.json");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    await writeGeneratedToolSchema();
}
