import { readFile } from "node:fs/promises";
import { generateToolSchemaText } from "./generateAgentToolSchema.mjs";

const outputPath = new URL(
    "../src/agent/generatedToolSchema.json",
    import.meta.url
);

const expected = await generateToolSchemaText();
const actual = await readFile(outputPath, "utf8");

if (actual !== expected) {
    throw new Error("Generated tool schema is out of date.");
}
