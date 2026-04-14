import { readFile } from "node:fs/promises";
import { createGeneratedToolCatalog, renderGeneratedToolCatalog } from "./generateAgentToolCatalog.mjs";

const outputPath = new URL(
    "../src/agent/generated/generatedToolCatalog.json",
    import.meta.url
);

const generatedToolCatalog = await createGeneratedToolCatalog();
const expected = await renderGeneratedToolCatalog(generatedToolCatalog);
const actual = await readFile(outputPath, "utf8");

if (actual !== expected) {
    throw new Error("Generated tool catalog is out of date.");
}
